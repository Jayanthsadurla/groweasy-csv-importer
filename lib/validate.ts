import { CRM_FIELDS, CRM_STATUS_VALUES, DATA_SOURCE_VALUES, type CrmRecord } from "./types";

const STATUS_SET = new Set<string>(CRM_STATUS_VALUES);
const SOURCE_SET = new Set<string>(DATA_SOURCE_VALUES);

/**
 * The AI is instructed to only use allowed enum values, but we never trust
 * an LLM blindly for data that flows into a real CRM. This pass corrects
 * or blanks anything out of contract instead of letting bad values slip
 * through, and it's the actual safety net that determines whether a row
 * ends up "successfully parsed" or "skipped".
 */
export function sanitizeRecord(
  rowIndex: number,
  raw: Record<string, string> | undefined
): CrmRecord {
  const record: Partial<CrmRecord> = { _rowIndex: rowIndex };
  for (const field of CRM_FIELDS) {
    const value = (raw?.[field] ?? "").toString().trim();
    record[field] = value;
  }

  if (record.crm_status && !STATUS_SET.has(record.crm_status)) {
    record.crm_note = appendNote(record.crm_note, `Unrecognized status from source: "${record.crm_status}"`);
    record.crm_status = "";
  }

  if (record.data_source && !SOURCE_SET.has(record.data_source)) {
    record.crm_note = appendNote(record.crm_note, `Unmatched source label: "${record.data_source}"`);
    record.data_source = "";
  }

  if (record.created_at) {
    const d = new Date(record.created_at);
    if (isNaN(d.getTime())) {
      record.crm_note = appendNote(record.crm_note, `Unparsable original date: "${record.created_at}"`);
      record.created_at = "";
    }
  }

  return record as CrmRecord;
}

function appendNote(existing: string | undefined, addition: string): string {
  return existing ? `${existing}; ${addition}` : addition;
}

export function hasContactInfo(record: CrmRecord): boolean {
  return Boolean(record.email?.trim()) || Boolean(record.mobile_without_country_code?.trim());
}
