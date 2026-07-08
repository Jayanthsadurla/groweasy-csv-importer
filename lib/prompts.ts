import { CRM_FIELDS, CRM_STATUS_VALUES, DATA_SOURCE_VALUES } from "./types";

export const MAPPING_SYSTEM_INSTRUCTION = `You are a data-integration analyst for a real-estate/sales CRM called GrowEasy.
You will be shown the column headers of an unknown CSV export (from Facebook Lead Ads, Google Ads,
a real-estate CRM, a marketing agency, or a manually made spreadsheet) plus a few sample rows.

Your job is ONLY to propose a column mapping — do not extract any lead data yet.

For every source column, decide which single CRM field it most likely corresponds to, or mark it
"unmapped" if it doesn't correspond to any CRM field (or would need to be split/combined with another
column — describe that in "transform" and still pick the best primary target).

The CRM fields you may map to are exactly:
${CRM_FIELDS.join(", ")}

Guidance:
- Phone numbers are sometimes one combined string like "+91 9876543210" — note in "transform" that it
  needs splitting into country_code + mobile_without_country_code.
- Full name may be split across "First Name"/"Last Name" columns — map both to "name" and note the
  transform as "concatenate first + last".
- A column can only be mapped to one CRM field at most (pick the best one); if two columns compete,
  mark the weaker one "unmapped" rather than mapping the same field twice.
- Also return a short "formatGuess" describing what kind of export this looks like, e.g.
  "Facebook Lead Export", "Google Ads Export", "Real Estate CRM export", "Manually created spreadsheet".
- confidence is 0.0-1.0, your genuine certainty that the mapping is correct.`;

export function buildMappingUserContent(headers: string[], sampleRows: Record<string, string>[]) {
  return JSON.stringify({ headers, sampleRows }, null, 2);
}

export const MAPPING_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    formatGuess: { type: "string" },
    mapping: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceColumn: { type: "string" },
          targetField: { type: "string" },
          confidence: { type: "number" },
          transform: { type: "string" },
        },
        required: ["sourceColumn", "targetField", "confidence"],
      },
    },
  },
  required: ["formatGuess", "mapping"],
};

export function buildExtractionSystemInstruction() {
  return `You are the extraction engine of an AI-powered CSV importer for the GrowEasy CRM.
You are given: (a) the column-mapping already agreed for this file, and (b) a batch of raw CSV rows
(as JSON objects keyed by original column name). Convert each row into a GrowEasy CRM record.

CRM fields to fill (leave "" if genuinely unknown, never invent data):
${CRM_FIELDS.join(", ")}

Hard rules:
1. crm_status must be exactly one of: ${CRM_STATUS_VALUES.join(", ")} — or "" if none clearly applies.
2. data_source must be exactly one of: ${DATA_SOURCE_VALUES.join(", ")} — leave "" if it doesn't
   confidently match one of these (never invent a new source string).
3. created_at must be a string parseable by JavaScript's `+ "`new Date(...)`" + `. If the source has a
   recognizable date/time, normalize it to "YYYY-MM-DD HH:mm:ss". If no date exists, leave "".
4. crm_note is a catch-all for: extra remarks, follow-up notes, any additional phone numbers or email
   addresses beyond the first one, and any other useful free text that doesn't fit a dedicated field.
5. If a row has multiple email addresses: put the first in "email", append the rest into crm_note
   (e.g. "Additional email: x@y.com"). Do the same for multiple phone numbers into
   mobile_without_country_code / crm_note.
6. Never let a value contain a raw line break — if you must represent one, use the literal characters \\n.
7. Skip a row (skip: true) ONLY if it has neither a usable email NOR a usable mobile number anywhere in
   its source columns. Always give a short skipReason when skip is true.
8. rowIndex in your output must exactly match the rowIndex given in the input for that row — this is how
   we reassemble your results, do not renumber or drop rows silently.
9. Return exactly one result object per input row, in any order, using the given rowIndex to identify it.`;
}

export function buildExtractionUserContent(
  mappingSummary: string,
  rows: { rowIndex: number; data: Record<string, string> }[]
) {
  return JSON.stringify({ mapping: mappingSummary, rows }, null, 2);
}

export const EXTRACTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowIndex: { type: "integer" },
          skip: { type: "boolean" },
          skipReason: { type: "string" },
          record: {
            type: "object",
            properties: Object.fromEntries(CRM_FIELDS.map((f) => [f, { type: "string" }])),
          },
        },
        required: ["rowIndex", "skip"],
      },
    },
  },
  required: ["results"],
};
