/**
 * Pure check core: `(input, ruleset, options) => Report`.
 *
 * No plugin context, no I/O, no clock and no model access, so the whole rule set
 * is unit-testable without credentials. Every finding carries the verbatim
 * clause that produced it, and every check that could not run is reported in
 * `skipped` so an empty issue list can never be read as "nothing is wrong".
 */

import { diffDays, parseWallClock } from './shared/datetime.ts'
import { disabledAsSkipped, formatBasis } from './shared/rules.ts'
import { paramNumber, paramStrings, ruleById } from './shared/ruleset.ts'
import { issueId, makeReport } from './shared/report.ts'
import type { Issue, Locator, Report, Skipped } from './shared/report.ts'
import type { Ruleset } from './shared/rules.ts'
import type { CaseRow, MedrecInput } from './model.ts'

/** Options that come from the plugin configuration rather than the rule pack. */
export interface CheckOptions {
  plugin: string
  checkedAt: string
  disabledRules: readonly string[]
  onlyRules: readonly string[]
  skipNotes?: string
}

interface RuleContext {
  input: MedrecInput
  ruleset: Ruleset
  issues: Issue[]
  skipped: Skipped[]
  fired: Set<string>
  skipReasons: Map<string, string>
  add(ruleId: string, locator: Locator, found: string, expected: string, fix?: string): void
  skip(ruleId: string, reason: string): void
}

function locatorOf(row: CaseRow, column?: string): Locator {
  const locator: Locator = { row: row.row }
  if (column !== undefined) locator.column = column
  return locator
}

/** Read a case field, treating a lone dash as the standard "no content" marker. */
function field(row: CaseRow, key: string): string | undefined {
  const raw = row.values[key]
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-') return undefined
  return trimmed
}

/** True when the column is entirely absent from the material. */
function columnAbsent(input: MedrecInput, key: string): boolean {
  return !input.cases.some((row) => row.columns.some((column) => column === key) || row.values[key] !== undefined)
}

function basisOf(ruleset: Ruleset, ruleId: string): string {
  const rule = ruleById(ruleset, ruleId)
  return formatBasis(rule.basis, rule.alsoBasis ?? [])
}

function makeAdd(context: Omit<RuleContext, 'add' | 'skip'>): RuleContext['add'] {
  return (ruleId, locator, found, expected, fix) => {
    const rule = ruleById(context.ruleset, ruleId)
    const issue: Issue = {
      id: issueId(context.ruleset.plugin, ruleId, locator),
      ruleId,
      severity: rule.severity,
      locator,
      found,
      expected,
      basis: formatBasis(rule.basis, rule.alsoBasis ?? []),
    }
    if (fix !== undefined) issue.fix = fix
    context.issues.push(issue)
    context.fired.add(ruleId)
  }
}

/** Run a per-field presence check, skipping cleanly when the column is absent. */
function perField(
  context: RuleContext,
  ruleId: string,
  keys: readonly string[],
  report: (row: CaseRow, key: string, value: string | undefined) => void,
): void {
  const present = keys.filter((key) => !columnAbsent(context.input, key))
  const absent = keys.filter((key) => columnAbsent(context.input, key))
  if (present.length === 0) {
    context.skip(ruleId, `材料中完全没有以下字段：${absent.join('、')}；无法执行检查`)
    return
  }
  if (absent.length > 0) {
    context.skip(ruleId, `材料中缺少字段：${absent.join('、')}；这些字段未参与检查`)
  }
  for (const row of context.input.cases) {
    for (const key of present) report(row, key, field(row, key))
  }
}

/**
 * MR-001 — every required column carries content, or the standard `-` marker.
 *
 * `-` is the marker 附件1 defines for "nothing to record here", so it satisfies
 * this check. Whether a dash is actually acceptable for a particular column is a
 * separate question: the signature columns have their own rule (MR-009), which
 * treats a dash as a missing signature.
 */
function checkRequiredFields(context: RuleContext): void {
  const ruleId = 'MR-001'
  const rule = ruleById(context.ruleset, ruleId)
  const keys = paramStrings(rule, 'fields', [])
  if (keys.length === 0) {
    context.skip(ruleId, '规则库未配置必填字段清单')
    return
  }
  const present = keys.filter((key) => !columnAbsent(context.input, key))
  const absent = keys.filter((key) => columnAbsent(context.input, key))
  if (present.length === 0) {
    context.skip(ruleId, `材料中完全没有以下字段：${absent.join('、')}；无法执行检查`)
    return
  }
  if (absent.length > 0) {
    context.skip(ruleId, `材料中缺少字段：${absent.join('、')}；这些字段未参与检查`)
  }
  for (const row of context.input.cases) {
    for (const key of present) {
      const cell = row.values[key]?.trim()
      // A real value satisfies the check; so does the `-` marker, because 附件1
      // defines it as the way to say "there is nothing to record here".
      if (cell !== undefined && cell !== '') continue
      context.add(
        ruleId,
        locatorOf(row, key),
        `「${key}」为空`,
        `附件1 必填栏不能为空项，没有可填写内容时填写"-"`,
        '按 24 号文附件1 的必填项目列表补齐，确无可填内容时填「-」',
      )
    }
  }
}

/** MR-002 — admission and discharge times are present and precise to the minute. */
function checkTimes(context: RuleContext): void {
  const ruleId = 'MR-002'
  const rule = ruleById(context.ruleset, ruleId)
  const keys = paramStrings(rule, 'fields', ['入院时间', '出院时间'])
  const requireMinute = rule.params.requireMinute !== false
  perField(context, ruleId, keys, (row, key, value) => {
    if (value === undefined) {
      context.add(ruleId, locatorOf(row, key), `「${key}」为空`, `「${key}」应填写且精确到分钟`, '补填时间')
      return
    }
    const wall = parseWallClock(value)
    if (wall === undefined) {
      context.add(ruleId, locatorOf(row, key), `「${key}」的值「${value}」无法解析为日期时间`, '时间应为可解析的日期时间', '核对日期时间格式')
      return
    }
    if (requireMinute && !wall.hasTime) {
      context.add(
        ruleId,
        locatorOf(row, key),
        `「${key}」的值「${value}」只精确到日`,
        '记录时间应当精确到分钟',
        '补齐时分',
      )
    }
  })
}

/** MR-003 — the discharge time is not before the admission time. */
function checkTimeOrder(context: RuleContext): void {
  const ruleId = 'MR-003'
  if (columnAbsent(context.input, '入院时间') || columnAbsent(context.input, '出院时间')) {
    context.skip(ruleId, '材料缺少入院时间或出院时间字段，无法比对先后关系')
    return
  }
  for (const row of context.input.cases) {
    const admitted = field(row, '入院时间')
    const discharged = field(row, '出院时间')
    if (admitted === undefined || discharged === undefined) continue
    const from = parseWallClock(admitted)
    const to = parseWallClock(discharged)
    if (from === undefined || to === undefined) continue
    const minutes = (to.minutes + diffDays(from.date, to.date) * 1440) - from.minutes
    if (minutes >= 0) continue
    context.add(
      ruleId,
      locatorOf(row, '出院时间'),
      `入院 ${admitted} → 出院 ${discharged}，出院时间早于入院时间`,
      '出院时间不应早于入院时间',
      '核对两条时间的取值来源',
    )
  }
}

/** MR-004 — the recorded length of stay matches the admission and discharge dates. */
function checkLengthOfStay(context: RuleContext): void {
  const ruleId = 'MR-004'
  const rule = ruleById(context.ruleset, ruleId)
  const key = typeof rule.params.field === 'string' ? rule.params.field : '实际住院天数'
  if (columnAbsent(context.input, key)) {
    context.skip(ruleId, `材料未提供「${key}」字段，无法核对住院天数`)
    return
  }
  if (columnAbsent(context.input, '入院时间') || columnAbsent(context.input, '出院时间')) {
    context.skip(ruleId, '材料缺少入院时间或出院时间字段，无法推算住院天数')
    return
  }
  for (const row of context.input.cases) {
    const declared = field(row, key)
    if (declared === undefined) {
      context.add(ruleId, locatorOf(row, key), `「${key}」为空`, `「${key}」应与入院、出院日期一致`, '补填住院天数')
      continue
    }
    if (!/^\d+$/.test(declared)) {
      context.add(ruleId, locatorOf(row, key), `「${key}」的值「${declared}」不是整数`, '住院天数应为整数天', '核对取值')
      continue
    }
    const admitted = field(row, '入院时间')
    const discharged = field(row, '出院时间')
    if (admitted === undefined || discharged === undefined) continue
    const from = parseWallClock(admitted)
    const to = parseWallClock(discharged)
    if (from === undefined || to === undefined) continue
    const expected = diffDays(from.date, to.date)
    if (expected < 0) continue
    const actual = Number.parseInt(declared, 10)
    if (actual === expected) continue
    context.add(
      ruleId,
      locatorOf(row, key),
      `填 ${actual} 天；按入院 ${from.date}、出院 ${to.date} 推算为 ${expected} 天`,
      '入院日与出院日只计算一天',
      '核对天数与入出院日期；同日入出院计 0 天',
    )
  }
}

/** MR-005 and MR-007 — paired fields must be filled together. */
function checkPairedFields(context: RuleContext): void {
  const specs: { ruleId: string; keys: readonly string[]; label: string; guard?: () => boolean }[] = [
    { ruleId: 'MR-005', keys: ['主要诊断名称', '主要诊断编码'], label: '主要诊断名称与编码' },
    {
      ruleId: 'MR-007',
      keys: ['主要手术名称', '主要手术编码'],
      label: '主要手术名称与编码',
      guard: () => context.input.cases.some((row) => {
        const flag = field(row, '有手术操作') ?? field(row, '主要手术名称') ?? field(row, '主要手术编码')
        return flag !== undefined
      }),
    },
  ]
  for (const spec of specs) {
    if (spec.guard !== undefined && !spec.guard()) {
      context.skip(spec.ruleId, `材料中没有手术或操作记录，${spec.label}的配对检查不适用`)
      continue
    }
    const present = spec.keys.filter((key) => !columnAbsent(context.input, key))
    if (present.length === 0) {
      context.skip(spec.ruleId, `材料中完全没有以下字段：${spec.keys.join('、')}`)
      continue
    }
    for (const row of context.input.cases) {
      const filled = spec.keys.filter((key) => field(row, key) !== undefined)
      if (filled.length === 0) {
        if (spec.ruleId === 'MR-007') continue
        context.add(
          spec.ruleId,
          locatorOf(row),
          `${spec.label}均为空`,
          `${spec.label}应同时填写`,
          '按首页必填项目列表补齐',
        )
        continue
      }
      if (filled.length === spec.keys.length) continue
      const missing = spec.keys.filter((key) => field(row, key) === undefined)
      context.add(
        spec.ruleId,
        locatorOf(row, missing[0]),
        `${spec.label}只填了 ${filled.join('、')}，缺 ${missing.join('、')}`,
        `${spec.label}应同时填写`,
        '补齐缺失的一项',
      )
    }
  }
}

/** MR-006 and MR-008 — coding form. */
function checkCodeForm(context: RuleContext): void {
  const specs: { ruleId: string; key: string; label: string; defaultPattern: string }[] = [
    { ruleId: 'MR-006', key: '主要诊断编码', label: '疾病诊断编码', defaultPattern: '^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$' },
    { ruleId: 'MR-008', key: '主要手术编码', label: '手术和操作编码', defaultPattern: '^[0-9]{2}(\\.[0-9]{1,2})?$' },
  ]
  for (const spec of specs) {
    const rule = ruleById(context.ruleset, spec.ruleId)
    const pattern = typeof rule.params.pattern === 'string' ? rule.params.pattern : spec.defaultPattern
    const matcher = new RegExp(pattern)
    if (columnAbsent(context.input, spec.key)) {
      context.skip(spec.ruleId, `材料未提供「${spec.key}」字段，无法核对编码形式`)
      continue
    }
    for (const row of context.input.cases) {
      const value = field(row, spec.key)
      if (value === undefined) continue
      if (matcher.test(value)) continue
      context.add(
        spec.ruleId,
        locatorOf(row, spec.key),
        `「${spec.key}」的值「${value}」不符合编码形式`,
        `${spec.label}应统一使用规定分类与代码，形式为 ${pattern}`,
        '核对编码；形式核对不校验该编码是否存在于某一版本目录中，编码正确性需编码员复核',
      )
    }
  }
}

/** MR-009 — the signature block reflects three-level physician responsibility. */
function checkSignatures(context: RuleContext): void {
  const ruleId = 'MR-009'
  const rule = ruleById(context.ruleset, ruleId)
  const keys = paramStrings(rule, 'fields', ['住院医师', '主治医师', '主任（副主任）医师'])
  const present = keys.filter((key) => !columnAbsent(context.input, key))
  if (present.length === 0) {
    context.skip(ruleId, `材料中完全没有签名相关字段：${keys.join('、')}`)
    return
  }
  for (const row of context.input.cases) {
    // A lone dash is 附件1's marker for "nothing to record here"; for a signature
    // column that still means no signature is present, so it counts as a miss.
    const filled = present.filter((key) => {
      const cell = row.values[key]?.trim()
      return cell !== undefined && cell !== '' && cell !== '-'
    })
    if (filled.length === present.length) continue
    const missing = present.filter((key) => !filled.includes(key))
    context.add(
      ruleId,
      locatorOf(row, missing[0]),
      `签名栏缺 ${missing.join('、')}`,
      '医师签名要能体现三级医师负责制',
      '补齐三级医师签名；本条绑定具体栏位，不笼统表述为「医师签名必填」',
    )
  }
}

/** MR-010 — the discharge mode is one of the defined codes. */
function checkDischargeMode(context: RuleContext): void {
  const ruleId = 'MR-010'
  const rule = ruleById(context.ruleset, ruleId)
  const key = typeof rule.params.field === 'string' ? rule.params.field : '离院方式'
  const allowed = paramStrings(rule, 'allowed', ['1', '2', '3', '4', '5', '9'])
  if (columnAbsent(context.input, key)) {
    context.skip(ruleId, `材料未提供「${key}」字段，无法核对离院方式代码`)
    return
  }
  for (const row of context.input.cases) {
    const value = field(row, key)
    if (value === undefined) {
      context.add(ruleId, locatorOf(row, key), `「${key}」为空`, '离院方式应填写规定代码', '补填离院方式')
      continue
    }
    if (allowed.includes(value)) continue
    context.add(
      ruleId,
      locatorOf(row, key),
      `「${key}」的值「${value}」不在规定代码内`,
      `离院方式取值应为 ${allowed.join(' / ')}`,
      '核对取值；本条只核对代码范围，不判断选择是否正确',
    )
  }
}

/** MR-011 — age format: integer for adults, month fraction under one year. */
function checkAgeFormat(context: RuleContext): void {
  const ruleId = 'MR-011'
  const rule = ruleById(context.ruleset, ruleId)
  const key = typeof rule.params.field === 'string' ? rule.params.field : '年龄'
  if (columnAbsent(context.input, key)) {
    context.skip(ruleId, `材料未提供「${key}」字段，无法核对年龄书写形式`)
    return
  }
  const underOne = new RegExp(
    typeof rule.params.underOnePattern === 'string' ? rule.params.underOnePattern : '^[0-9]{1,2}( [0-9]{1,2}/30)? 月$',
  )
  const adult = new RegExp(typeof rule.params.adultPattern === 'string' ? rule.params.adultPattern : '^[0-9]{1,3}$')
  const dayAge = /^[0-9]{1,3} ?天$/
  for (const row of context.input.cases) {
    const value = field(row, key)
    if (value === undefined) continue
    if (adult.test(value) || underOne.test(value)) continue
    if (dayAge.test(value)) {
      context.add(
        ruleId,
        locatorOf(row, key),
        `「${key}」按天龄填写为「${value}」`,
        '卫生口径要求不足1周岁按实足月龄、以分母为30的分数形式填写',
        '国家层面未找到「不足1个月填写日龄」的明文；医保口径另有按天龄填写的规定，两套口径不一致，请按本院上报口径确认',
      )
      continue
    }
    context.add(
      ruleId,
      locatorOf(row, key),
      `「${key}」的值「${value}」不符合整数岁或「N M/30 月」两种形式`,
      '满1周岁填实足年龄整数；不足1周岁按月龄分数形式填写',
      '核对年龄书写形式',
    )
  }
}

/** MR-012 — neonatal weights are recorded to the nearest 10 grams. */
function checkNeonatalWeight(context: RuleContext): void {
  const ruleId = 'MR-012'
  const rule = ruleById(context.ruleset, ruleId)
  const keys = paramStrings(rule, 'fields', ['新生儿出生体重', '新生儿入院体重'])
  const multipleOf = paramNumber(rule, 'multipleOf', 10)
  const present = keys.filter((key) => !columnAbsent(context.input, key))
  if (present.length === 0) {
    context.skip(ruleId, `材料未提供新生儿体重字段：${keys.join('、')}；本条不适用或无法检查`)
    return
  }
  for (const row of context.input.cases) {
    for (const key of present) {
      const value = field(row, key)
      if (value === undefined) continue
      const numeric = value.replace(/[,\s]/g, '')
      if (!/^\d+$/.test(numeric)) {
        context.add(ruleId, locatorOf(row, key), `「${key}」的值「${value}」不是整数克数`, `「${key}」要求精确到 ${multipleOf} 克`, '核对取值与单位')
        continue
      }
      if (Number.parseInt(numeric, 10) % multipleOf === 0) continue
      context.add(
        ruleId,
        locatorOf(row, key),
        `「${key}」的值「${value}」不是 ${multipleOf} 的整数倍`,
        `「${key}」要求精确到 ${multipleOf} 克`,
        '核对称重记录与实际填写单位',
      )
    }
  }
}

/** MR-013 — the count of other diagnoses stays within the configured ceiling. */
function checkOtherDiagnoses(context: RuleContext): void {
  const ruleId = 'MR-013'
  const rule = ruleById(context.ruleset, ruleId)
  const key = typeof rule.params.field === 'string' ? rule.params.field : '其他诊断'
  const maxChecked = paramNumber(rule, 'maxChecked', 3)
  if (columnAbsent(context.input, key)) {
    context.skip(ruleId, `材料未提供「${key}」字段，无法核对其他诊断条数`)
    return
  }
  for (const row of context.input.cases) {
    const value = field(row, key)
    if (value === undefined) continue
    const entries = value.split(/[;；、|\n]+/).map((entry) => entry.trim()).filter((entry) => entry !== '')
    if (entries.length <= maxChecked) continue
    context.add(
      ruleId,
      locatorOf(row, key),
      `「${key}」共有 ${entries.length} 条`,
      `填写其他诊断时，先填写主要疾病并发症，后填写合并症；先重后轻；先已治疗后未治疗（本条核对上限 ${maxChecked} 条）`,
      '核对排序原则；顺序正确性需要临床判断，无法由本工具自动判定',
    )
  }
}

/** MR-014 — a diagnosis that does not match the recorded sex needs human review. */
function checkSexDiagnosis(context: RuleContext): void {
  const ruleId = 'MR-014'
  const rule = ruleById(context.ruleset, ruleId)
  const sexKey = typeof rule.params.sexField === 'string' ? rule.params.sexField : '性别'
  const diagnosisKeys = paramStrings(rule, 'diagnosisFields', ['主要诊断名称', '其他诊断'])
  const ruleSpecs = Array.isArray(rule.params.rules) ? (rule.params.rules as { sex?: unknown; label?: unknown; pattern?: unknown }[]) : []
  if (columnAbsent(context.input, sexKey)) {
    context.skip(ruleId, `材料未提供「${sexKey}」字段，无法核对诊断与性别的关系`)
    return
  }
  const usable = ruleSpecs.filter((spec) => typeof spec.sex === 'string' && typeof spec.pattern === 'string')
  if (usable.length === 0) {
    context.skip(ruleId, '规则库未配置性别与诊断的对照规则')
    return
  }
  for (const row of context.input.cases) {
    const sex = field(row, sexKey)
    if (sex === undefined) continue
    const diagnoses = diagnosisKeys
      .map((key) => field(row, key))
      .filter((value): value is string => value !== undefined)
    if (diagnoses.length === 0) continue
    for (const spec of usable) {
      if (sex !== spec.sex) continue
      const matcher = new RegExp(spec.pattern as string)
      for (const key of diagnosisKeys) {
        const value = field(row, key)
        if (value === undefined || !matcher.test(value)) continue
        const label = typeof spec.label === 'string' ? spec.label : String(spec.sex)
        context.add(
          ruleId,
          locatorOf(row, key),
          `性别为「${label}」，诊断「${value}」与常见性别归属不一致`,
          '该诊断与该性别常见不相容，建议核实性别或诊断',
          '本条依据为国家医保局“诊断与患者性别不符”规则类型，已公开明细未含妊娠分娩章节，且明确允许临床合理性例外，须人工复核',
        )
      }
    }
  }
}

/** MR-015 — a death discharge implies the discharge time is the death time. */
function checkDeathDischarge(context: RuleContext): void {
  const ruleId = 'MR-015'
  const rule = ruleById(context.ruleset, ruleId)
  const modeKey = typeof rule.params.dischargeModeField === 'string' ? rule.params.dischargeModeField : '离院方式'
  const deathCode = typeof rule.params.deathCode === 'string' ? rule.params.deathCode : '5'
  const timeKey = typeof rule.params.dischargeTimeField === 'string' ? rule.params.dischargeTimeField : '出院时间'
  const deathTimeKey = typeof rule.params.deathTimeField === 'string' ? rule.params.deathTimeField : '死亡时间'
  if (columnAbsent(context.input, modeKey)) {
    context.skip(ruleId, `材料未提供「${modeKey}」字段，无法定位死亡病例`)
    return
  }
  const deaths = context.input.cases.filter((row) => field(row, modeKey) === deathCode)
  if (deaths.length === 0) {
    context.skip(ruleId, `材料中没有离院方式为「${deathCode}」的病例`)
    return
  }
  const hasDeathTime = !columnAbsent(context.input, deathTimeKey)
  if (!hasDeathTime) {
    context.skip(ruleId, `材料未提供「${deathTimeKey}」字段；仅按出院时间的定义给出提示`)
  }
  for (const row of deaths) {
    const discharged = field(row, timeKey)
    const deathTime = hasDeathTime ? field(row, deathTimeKey) : undefined
    if (discharged === undefined && deathTime === undefined) {
      context.add(
        ruleId,
        locatorOf(row, timeKey),
        '离院方式为死亡，但出院时间与死亡时间均为空',
        '死亡患者的出院时间是指其死亡时间',
        '补填出院时间；建议同时核对死亡记录',
      )
      continue
    }
    if (discharged === undefined || deathTime === undefined) continue
    const first = parseWallClock(discharged)
    const second = parseWallClock(deathTime)
    if (first === undefined || second === undefined) continue
    const minutes = (second.minutes + diffDays(first.date, second.date) * 1440) - first.minutes
    if (minutes === 0) continue
    context.add(
      ruleId,
      locatorOf(row, timeKey),
      `出院时间 ${discharged} 与死亡时间 ${deathTime} 不一致`,
      '死亡患者的出院时间是指其死亡时间',
      '核对两条时间；本条为推导性提示，国家层面未见独立明文条款',
    )
  }
}

const CHECKERS: readonly ((context: RuleContext) => void)[] = [
  checkRequiredFields,
  checkTimes,
  checkTimeOrder,
  checkLengthOfStay,
  checkPairedFields,
  checkCodeForm,
  checkSignatures,
  checkDischargeMode,
  checkAgeFormat,
  checkNeonatalWeight,
  checkOtherDiagnoses,
  checkSexDiagnosis,
  checkDeathDischarge,
]

/**
 * Run the whole rule pack against one front-sheet export.
 * @param input - normalized cases.
 * @param ruleset - validated rule pack.
 * @param options - plugin identity, clock value and rule selection.
 * @returns the report, with `skipped` listing every check that did not run.
 */
export function runCheck(input: MedrecInput, ruleset: Ruleset, options: CheckOptions): Report {
  const disabled = new Set([...ruleset.disabled, ...options.disabledRules])
  const only = new Set(options.onlyRules)
  const base = {
    input,
    ruleset,
    issues: [] as Issue[],
    skipped: [] as Skipped[],
    fired: new Set<string>(),
    skipReasons: new Map<string, string>(),
  }
  const context: RuleContext = {
    ...base,
    add: makeAdd(base),
    skip: (ruleId, reason) => {
      const existing = base.skipReasons.get(ruleId)
      base.skipReasons.set(ruleId, existing === undefined ? reason : `${existing}；${reason}`)
    },
  }

  for (const checker of CHECKERS) checker(context)

  const withNote = (reason: string): string => (options.skipNotes === undefined ? reason : `${reason}；${options.skipNotes}`)
  const skipped: Skipped[] = disabledAsSkipped(ruleset, [...disabled], withNote('该规则在当前配置中被禁用'))
  const already = new Set(skipped.map((entry) => entry.rule))
  for (const [ruleId, reason] of base.skipReasons) {
    if (already.has(ruleId)) continue
    if (disabled.has(ruleId) || (options.onlyRules.length > 0 && !only.has(ruleId))) continue
    skipped.push({ rule: ruleId, reason: withNote(reason) })
    already.add(ruleId)
  }
  for (const rule of ruleset.rules) {
    if (disabled.has(rule.id) || base.fired.has(rule.id) || already.has(rule.id)) continue
    if (options.onlyRules.length > 0 && !only.has(rule.id)) continue
    skipped.push({ rule: rule.id, reason: withNote('材料满足该检查的前置条件且未发现差异条目') })
  }
  if (options.onlyRules.length > 0) {
    const notSelected = ruleset.rules.filter((rule) => !only.has(rule.id) && !disabled.has(rule.id))
    if (notSelected.length > 0) {
      skipped.push({
        rule: notSelected.map((rule) => rule.id).join(','),
        reason: withNote(`本次调用通过 only 参数把执行范围限制为 ${[...only].join(', ')}，上列规则未执行`),
      })
    }
  }

  return makeReport({
    plugin: options.plugin,
    target: input.target,
    rulesetVersion: ruleset.version,
    checkedAt: options.checkedAt,
    issues: context.issues,
    skipped,
  })
}
