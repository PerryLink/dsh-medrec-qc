/**
 * Case-material model for the front-sheet checker.
 *
 * A 病案首页 export is a table of cases, one row per discharge, with a stable but
 * frequently renamed column set (`HQMS` national assessment exports, health
 * statistics exports and hospital-local exports all differ). The reader
 * therefore keeps the raw field map and resolves canonical field names through
 * the shared dictionary, so the rule pack can be written against stable keys and
 * a hospital can still feed its own export.
 */

/** One discharged case as exported from the front sheet. */
export interface CaseRow {
  /** 1-based row number in the source, excluding the header. */
  row: number
  /** Raw field name to trimmed value, for cells that carried content. */
  raw: Record<string, string>
  /** Canonical field name to value, filled by the reader where it could map one. */
  values: Record<string, string>
  /**
   * Every key the export provided for this row, including keys whose cell was
   * blank. Presence is tracked separately from content so that "the export does
   * not have this column" is never confused with "this cell is empty": the first
   * makes a check unrunnable, the second is itself a finding.
   */
  columns: string[]
  /** Source file or sheet, when the material came from one file. */
  file?: string
}

/** The whole normalized input. */
export interface MedrecInput {
  target: string
  cases: CaseRow[]
  /** Canonical fields the export never provided, so their checks cannot run. */
  missingFields: string[]
  /** Header cells the reader could not map to a canonical field. */
  unknownColumns: string[]
  warnings: string[]
}
