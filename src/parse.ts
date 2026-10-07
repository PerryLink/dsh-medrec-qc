/**
 * Reader for the canonical front-sheet material, plus the column dictionary.
 *
 * The material is JSON or YAML with a `cases` list. Header spellings vary
 * between the national-assessment export, the health-statistics export and
 * hospital-local exports, so the reader maps raw column names to the canonical
 * keys the rule pack uses, and reports the columns it could not map instead of
 * silently ignoring them — an unmapped column is exactly how a check goes
 * missing without anyone noticing.
 */

import { YamlSubsetError, parseYaml } from './shared/yaml.ts'
import { resolveHeaders, type FieldAliases } from './shared/dictionary.ts'
import type { CaseRow, MedrecInput } from './model.ts'

/** Raised when the material cannot be read at all. */
export class MaterialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MaterialError'
  }
}

/** Canonical field names and the spellings seen in real exports. */
export const CASE_FIELDS: readonly FieldAliases[] = [
  { key: '病案号', aliases: ['病案号', '住院号', '病案编号', 'MEDICAL_RECORD_NO', 'mrNo'], required: true },
  { key: '入院时间', aliases: ['入院时间', '入院日期时间', 'ADMISSION_TIME', 'admitTime'], required: true },
  { key: '出院时间', aliases: ['出院时间', '出院日期时间', 'DISCHARGE_TIME', 'dischargeTime'], required: true },
  { key: '实际住院天数', aliases: ['实际住院天数', '住院天数', 'ACTUAL_DAYS', 'los'] },
  { key: '性别', aliases: ['性别', '性别代码', 'SEX', 'sexCode'] },
  { key: '出生日期', aliases: ['出生日期', 'BIRTH_DATE', 'birthDate'] },
  { key: '年龄', aliases: ['年龄', 'AGE', 'ageValue'] },
  { key: '离院方式', aliases: ['离院方式', '离院方式代码', 'DISCHARGE_MODE', 'dischargeMode'] },
  { key: '科主任', aliases: ['科主任', 'DEPARTMENT_HEAD'] },
  { key: '主任（副主任）医师', aliases: ['主任（副主任）医师', '主任医师', '副主任医师', 'CHIEF_PHYSICIAN'] },
  { key: '主治医师', aliases: ['主治医师', 'ATTENDING_PHYSICIAN'] },
  { key: '住院医师', aliases: ['住院医师', 'RESIDENT_PHYSICIAN'] },
  { key: '责任护士', aliases: ['责任护士', 'NURSE'] },
  { key: '编码员', aliases: ['编码员', 'CODER'] },
  { key: '主要诊断名称', aliases: ['（主要出院诊断）名称', '主要诊断名称', '主要诊断', 'MAIN_DIAGNOSIS_NAME'], required: true },
  { key: '主要诊断编码', aliases: ['（主要出院诊断）编码', '主要诊断编码', 'MAIN_DIAGNOSIS_CODE'], required: true },
  { key: '其他诊断', aliases: ['其他诊断', '其他诊断名称', 'OTHER_DIAGNOSIS'] },
  { key: '主要手术名称', aliases: ['（主要手术）名称', '主要手术名称', '主要手术或操作名称', 'MAIN_OPERATION_NAME'] },
  { key: '主要手术编码', aliases: ['（主要手术）编码', '主要手术编码', '主要手术或操作编码', 'MAIN_OPERATION_CODE'] },
  { key: '有手术操作', aliases: ['有手术操作', '手术操作', 'HAS_OPERATION'] },
  { key: '死亡时间', aliases: ['死亡时间', 'DEATH_TIME'] },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return undefined
}

/** Map one raw case object onto canonical keys. */
function mapCase(raw: Record<string, unknown>, index: number): { row: CaseRow; unknown: string[] } {
  const passthrough: Record<string, string> = {}
  const columns = Object.keys(raw).filter((key) => key !== 'row')
  for (const key of columns) {
    const rendered = text(raw[key])
    // A blank cell stays out of `raw`, but its column is still recorded below.
    if (rendered !== undefined) passthrough[key] = rendered
  }
  const resolved = resolveHeaders(columns, CASE_FIELDS)
  const values: Record<string, string> = {}
  const unknown: string[] = []
  columns.forEach((header, position) => {
    const canonical = resolved[position]
    const rendered = passthrough[header]
    if (rendered === undefined) {
      // Blank cell: keep the canonical key present so the rule can report it.
      if (canonical !== undefined && canonical !== '' && values[canonical] === undefined) values[canonical] = ''
      if (values[header] === undefined) values[header] = ''
      return
    }
    if (canonical === undefined || canonical === '') {
      unknown.push(header)
    } else if (values[canonical] === undefined) {
      // A later column must not silently overwrite an earlier, more specific one.
      values[canonical] = rendered
    }
    // Raw names stay reachable so a deployment can reference its own local field.
    if (values[header] === undefined) values[header] = rendered
  })
  const declaredRow = text(raw.row)
  const row: CaseRow = {
    row: declaredRow !== undefined && /^\d+$/.test(declaredRow) ? Number.parseInt(declaredRow, 10) : index + 1,
    raw: passthrough,
    values,
    columns,
  }
  return { row, unknown }
}

/**
 * Parse material into the normalized input contract.
 * @param source - JSON or YAML text.
 * @param target - description of where the material came from.
 * @returns normalized cases plus reader diagnostics.
 */
export function parseMaterial(source: string, target: string): MedrecInput {
  const trimmed = source.trim()
  if (trimmed === '') throw new MaterialError('材料为空')
  let document: unknown
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      document = JSON.parse(trimmed)
    } catch (error) {
      throw new MaterialError(`JSON 无法解析：${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    try {
      document = parseYaml(trimmed)
    } catch (error) {
      if (error instanceof YamlSubsetError) throw new MaterialError(`YAML 无法解析：${error.message}`)
      throw error
    }
  }

  const list = Array.isArray(document) ? document : isRecord(document) ? document.cases : undefined
  if (list === undefined || list === null) throw new MaterialError('材料缺少 cases 列表，无法执行检查')
  if (!Array.isArray(list)) throw new MaterialError('cases 必须是列表')
  if (list.length === 0) throw new MaterialError('cases 为空列表，无法执行检查')

  const warnings: string[] = []
  const unknownColumns = new Set<string>()
  const cases: CaseRow[] = list.map((entry, index) => {
    if (!isRecord(entry)) throw new MaterialError(`cases[${index}] 必须是映射`)
    const mapped = mapCase(entry, index)
    for (const column of mapped.unknown) unknownColumns.add(column)
    return mapped.row
  })

  const requiredKeys = CASE_FIELDS.filter((field) => field.required === true).map((field) => field.key)
  const provided = new Set<string>()
  for (const row of cases) for (const key of Object.keys(row.values)) provided.add(key)
  const missingFields = requiredKeys.filter((key) => !provided.has(key))
  if (missingFields.length > 0) {
    warnings.push(`材料未提供这些字段：${missingFields.join('、')}；相关检查无法执行，详见 skipped`)
  }
  if (unknownColumns.size > 0) {
    warnings.push(`有 ${unknownColumns.size} 个列名未能映射到规范字段：${[...unknownColumns].join('、')}`)
  }

  return { target, cases, missingFields, unknownColumns: [...unknownColumns], warnings }
}
