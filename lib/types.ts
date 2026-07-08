// Central schema definitions. Both the header-fingerprint phase and the
// extraction phase are built against this single source of truth so the
// prompts, the validators, and the UI table never drift apart.

export const CRM_FIELDS = [
  "created_at",
  "name",
  "email",
  "country_code",
  "mobile_without_country_code",
  "company",
  "city",
  "state",
  "country",
  "lead_owner",
  "crm_status",
  "crm_note",
  "data_source",
  "possession_time",
  "description",
] as const;

export type CrmField = (typeof CRM_FIELDS)[number];

export const CRM_STATUS_VALUES = [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE",
] as const;

export const DATA_SOURCE_VALUES = [
  "leads_on_demand",
  "meridian_tower",
  "eden_park",
  "varah_swamy",
  "sarjapur_plots",
] as const;

export type CrmRecord = Record<CrmField, string> & {
  _rowIndex: number;
  _confidence?: number;
};

export interface SkippedRecord {
  _rowIndex: number;
  reason: string;
  raw: Record<string, string>;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: CrmField | "unmapped";
  confidence: number; // 0-1
  transform?: string; // short human note, e.g. "split into country_code + mobile"
}

export interface SchemaFingerprint {
  hash: string;
  mapping: ColumnMapping[];
  formatGuess: string; // e.g. "Facebook Lead Export", "Manual spreadsheet"
}

// Server -> client streaming event contract (newline-delimited JSON)
export type StreamEvent =
  | { type: "phase"; phase: string; message: string }
  | { type: "mapping"; mapping: ColumnMapping[]; formatGuess: string; cached: boolean }
  | { type: "progress"; batchesDone: number; batchesTotal: number; rowsDone: number; rowsTotal: number }
  | { type: "batch_result"; records: CrmRecord[]; skipped: SkippedRecord[] }
  | { type: "batch_retry"; batchIndex: number; attempt: number }
  | { type: "complete"; totalImported: number; totalSkipped: number; totalRows: number }
  | { type: "error"; message: string };
