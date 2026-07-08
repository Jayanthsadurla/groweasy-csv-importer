import { NextRequest } from "next/server";
import Papa from "papaparse";
import { callGroqJSON } from "@/lib/groq";
import {
  getCachedMapping,
  setCachedMapping,
  hashHeaders,
} from "@/lib/schema-cache";
import {
  MAPPING_SYSTEM_INSTRUCTION,
  MAPPING_RESPONSE_SCHEMA,
  buildMappingUserContent,
  buildExtractionSystemInstruction,
  buildExtractionUserContent,
  EXTRACTION_RESPONSE_SCHEMA,
} from "@/lib/prompts";
import { sanitizeRecord, hasContactInfo } from "@/lib/validate";
import type {
  ColumnMapping,
  CrmRecord,
  SkippedRecord,
  StreamEvent,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 15;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(
          encoder.encode(JSON.stringify(event) + "\n")
        );
      };

      try {
        if (!apiKey) {
          send({
            type: "error",
            message:
              "Server is missing GROQ_API_KEY. Add it in your deployment's environment variables.",
          });
          controller.close();
          return;
        }

        const { csvText } = await req.json();

        if (!csvText || typeof csvText !== "string") {
          send({
            type: "error",
            message: "No CSV content received.",
          });
          controller.close();
          return;
        }

        // ---------- Parse CSV ----------
        send({
          type: "phase",
          phase: "parse",
          message: "Parsing CSV...",
        });

        const parsed = Papa.parse<Record<string, string>>(csvText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
        });

        const rows = (parsed.data || []).filter((r) =>
          Object.values(r).some(
            (v) => (v ?? "").toString().trim() !== ""
          )
        );

        const headers = parsed.meta.fields ?? [];

        if (rows.length === 0) {
          send({
            type: "error",
            message: "CSV has no data rows.",
          });
          controller.close();
          return;
        }

        // ---------- Phase 1: schema fingerprinting ----------
        send({
          type: "phase",
          phase: "mapping",
          message: "Analyzing column structure with Groq...",
        });

        const hash = hashHeaders(headers);

        let mapping: ColumnMapping[];
        let formatGuess: string;
        let cached = false;

        const cachedFp = getCachedMapping(hash);

        if (cachedFp) {
          mapping = cachedFp.mapping;
          formatGuess = cachedFp.formatGuess;
          cached = true;
        } else {
          const sampleRows = rows.slice(0, 3);

          const mappingResult = await callGroqJSON<{
            formatGuess: string;
            mapping: ColumnMapping[];
          }>({
            systemInstruction: MAPPING_SYSTEM_INSTRUCTION,
            userContent: buildMappingUserContent(
              headers,
              sampleRows
            ),
            responseSchema: MAPPING_RESPONSE_SCHEMA,
            apiKey,
          });

          mapping = mappingResult.mapping;
          formatGuess = mappingResult.formatGuess;

          setCachedMapping(hash, {
            hash,
            mapping,
            formatGuess,
          });
        }

        send({
          type: "mapping",
          mapping,
          formatGuess,
          cached,
        });

        const mappingSummary = mapping
          .filter((m) => m.targetField !== "unmapped")
          .map(
            (m) =>
              `"${m.sourceColumn}" -> ${m.targetField}${
                m.transform ? ` (${m.transform})` : ""
              }`
          )
          .join("; ");

        // ---------- Phase 2: batched extraction ----------
        const batches: {
          rowIndex: number;
          data: Record<string, string>;
        }[][] = [];

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          batches.push(
            rows
              .slice(i, i + BATCH_SIZE)
              .map((data, j) => ({
                rowIndex: i + j,
                data,
              }))
          );
        }

        send({
          type: "phase",
          phase: "extract",
          message: `Extracting ${rows.length} rows in ${batches.length} batch(es) with Groq...`,
        });

        let rowsDone = 0;

        const allRecords: CrmRecord[] = [];
        const allSkipped: SkippedRecord[] = [];

        for (let b = 0; b < batches.length; b++) {
          const batch = batches[b];

          let attempt = 0;
          let succeeded = false;

          while (attempt <= 2 && !succeeded) {
            try {
              if (attempt > 0) {
                send({
                  type: "batch_retry",
                  batchIndex: b,
                  attempt,
                });
              }

              const result = await callGroqJSON<{
                results: {
                  rowIndex: number;
                  skip: boolean;
                  skipReason?: string;
                  record?: Record<string, string>;
                }[];
              }>({
                systemInstruction:
                  buildExtractionSystemInstruction(),

                userContent: buildExtractionUserContent(
                  mappingSummary,
                  batch
                ),

                responseSchema:
                  EXTRACTION_RESPONSE_SCHEMA,

                apiKey,

                // Batch-level retry logic is handled here.
                maxRetries: 0,
              });

              const byIndex = new Map(
                result.results.map((r) => [
                  r.rowIndex,
                  r,
                ])
              );

              for (const item of batch) {
                const r = byIndex.get(item.rowIndex);

                if (!r || r.skip) {
                  allSkipped.push({
                    _rowIndex: item.rowIndex,
                    reason:
                      r?.skipReason ||
                      "No email or mobile number found.",
                    raw: item.data,
                  });
                  continue;
                }

                const clean = sanitizeRecord(
                  item.rowIndex,
                  r.record
                );

                if (!hasContactInfo(clean)) {
                  allSkipped.push({
                    _rowIndex: item.rowIndex,
                    reason:
                      "No usable email or mobile number after validation.",
                    raw: item.data,
                  });
                  continue;
                }

                allRecords.push(clean);
              }

              rowsDone += batch.length;

              send({
                type: "progress",
                batchesDone: b + 1,
                batchesTotal: batches.length,
                rowsDone,
                rowsTotal: rows.length,
              });

              const batchStartIndex =
                batch[0].rowIndex;

              const batchEndIndex =
                batch[batch.length - 1].rowIndex;

              send({
                type: "batch_result",

                records: allRecords.filter(
                  (r) =>
                    r._rowIndex >= batchStartIndex &&
                    r._rowIndex <= batchEndIndex
                ),

                skipped: allSkipped.filter(
                  (s) =>
                    s._rowIndex >= batchStartIndex &&
                    s._rowIndex <= batchEndIndex
                ),
              });

              succeeded = true;
            } catch (err) {
              attempt++;

              if (attempt > 2) {
                // Batch failed after retries.
                // Preserve every row as skipped instead
                // of silently losing data.
                for (const item of batch) {
                  allSkipped.push({
                    _rowIndex: item.rowIndex,
                    reason:
                      "AI extraction failed for this batch after 3 attempts.",
                    raw: item.data,
                  });
                }

                rowsDone += batch.length;

                send({
                  type: "progress",
                  batchesDone: b + 1,
                  batchesTotal: batches.length,
                  rowsDone,
                  rowsTotal: rows.length,
                });

                // Also stream failed rows to the client.
                send({
                  type: "batch_result",
                  records: [],
                  skipped: allSkipped.filter(
                    (s) =>
                      s._rowIndex >=
                        batch[0].rowIndex &&
                      s._rowIndex <=
                        batch[batch.length - 1].rowIndex
                  ),
                });
              }
            }
          }
        }

        send({
          type: "complete",
          totalImported: allRecords.length,
          totalSkipped: allSkipped.length,
          totalRows: rows.length,
        });

        controller.close();
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected server error.";

        send({
          type: "error",
          message,
        });

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":
        "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}