import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadRuleset } from '../src/shared/ruleset.ts'
import { CASE_FIELDS, parseMaterial } from '../src/parse.ts'
import { runCheck } from '../src/check.ts'
import { buildView } from '../src/view.ts'
import { findForbiddenWording } from '../src/shared/wording.ts'
import { addDays, diffDays, parseWallClock } from '../src/shared/datetime.ts'
import { canonicalize, resolveHeaders, suggestHeader, ASSESSMENT_SYNONYMS } from '../src/shared/dictionary.ts'
import { parseYaml } from '../src/shared/yaml.ts'
import { Config as ConfigSchema } from '../src/config.ts'
import { inject, name as pluginName, resolvePackageFile, TOOL_NAME } from '../src/index.ts'
import type { Report } from '../src/shared/report.ts'
import type { CheckOptions } from '../src/check.ts'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const rulesPath = join(packageRoot, 'rules', 'medrec-qc.yaml')
const fixturesRoot = join(here, 'fixtures')
const CHECKED_AT = '2026-10-06T00:00:00.000Z'

interface CaseFile {
  ruleId: string
  configure?: Record<string, Record<string, unknown>>
  pairs: { name: string; material: string; expect: { ruleId: string; count: number } }[]
}

async function loadPack() {
  return loadRuleset(await readFile(rulesPath, 'utf8'))
}

function runOptions(overrides: Partial<CheckOptions> = {}): CheckOptions {
  return { plugin: pluginName, checkedAt: CHECKED_AT, disabledRules: [], onlyRules: [], ...overrides }
}

function withConfiguration(ruleset: Awaited<ReturnType<typeof loadPack>>, configure: CaseFile['configure']) {
  if (configure === undefined) return ruleset
  return {
    ...ruleset,
    rules: ruleset.rules.map((rule) =>
      configure[rule.id] === undefined ? rule : { ...rule, params: { ...rule.params, ...configure[rule.id] } },
    ),
  }
}

async function runFixture(materialText: string, target: string, configure?: CaseFile['configure']): Promise<Report> {
  const ruleset = withConfiguration(await loadPack(), configure)
  return runCheck(parseMaterial(materialText, target), ruleset, runOptions())
}

function issuesOf(report: Report, ruleId: string) {
  return report.issues.filter((issue) => issue.ruleId === ruleId)
}

async function ruleDirectories(): Promise<string[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
}

async function readCases(directory: string): Promise<CaseFile> {
  return JSON.parse(await readFile(join(fixturesRoot, directory, 'cases.json'), 'utf8')) as CaseFile
}

/** One fully filled front-sheet case, matching the fixture base. */
function goodCase(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const base: Record<string, string | undefined> = {
    病案号: 'A2026030001',
    入院时间: '2026-03-01 08:30',
    出院时间: '2026-03-06 10:00',
    实际住院天数: '5',
    性别: '1',
    出生日期: '1972-05-04',
    年龄: '53',
    离院方式: '1',
    科主任: '赵主任',
    主任医师: '钱主任医师',
    主治医师: '孙主治',
    住院医师: '李医师',
    责任护士: '周护士',
    编码员: '吴编码',
    主要诊断名称: '2型糖尿病',
    主要诊断编码: 'E11.900',
    其他诊断: '高血压;慢性肾功能不全',
    主要手术名称: '腹腔镜胆囊切除术',
    主要手术编码: '51.2300',
    有手术操作: '1',
    ...overrides,
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) if (value !== undefined) out[key] = value
  return out
}

function asMaterial(rows: Record<string, string>[]): string {
  return JSON.stringify({ cases: rows })
}

describe('rule pack', () => {
  it('declares a citable basis for every rule', async () => {
    const ruleset = await loadPack()
    expect(ruleset.plugin).toBe(pluginName)
    expect(ruleset.rules.length).toBeGreaterThanOrEqual(15)
    for (const rule of ruleset.rules) {
      expect(rule.basis.document, `${rule.id} document`).not.toBe('')
      expect(rule.basis.clause, `${rule.id} clause`).not.toBe('')
      expect(rule.basis.excerpt.length, `${rule.id} excerpt`).toBeGreaterThanOrEqual(8)
      expect(rule.basis.source, `${rule.id} source`).toMatch(/^https?:\/\//)
      expect(['direct', 'derived-from-principle', 'institutional-configuration']).toContain(rule.basis.kind)
    }
  })

  it('never lets a principle-derived or locally configured check be an error', async () => {
    const ruleset = await loadPack()
    for (const rule of ruleset.rules) {
      if (rule.basis.kind === 'derived-from-principle') expect(rule.severity, rule.id).not.toBe('error')
      if (rule.basis.kind === 'institutional-configuration') expect(rule.severity, rule.id).toBe('info')
    }
  })

  it('keeps the sex-versus-diagnosis check at warn, because the national rule type does not cover it', async () => {
    const ruleset = await loadPack()
    const sexCheck = ruleset.rules.find((rule) => rule.id === 'MR-014')
    expect(sexCheck?.severity).toBe('warn')
    expect(sexCheck?.basis.kind).toBe('derived-from-principle')
    expect(sexCheck?.note).toContain('O 章')
    expect(sexCheck?.note).toContain('临床合理性例外')
  })

  it('attributes the age format to 卫医政发〔2011〕84号, not to the 2010 病历书写规范', async () => {
    const ruleset = await loadPack()
    const age = ruleset.rules.find((rule) => rule.id === 'MR-011')
    expect(age?.basis.number).toBe('卫医政发〔2011〕84号')
    expect(age?.basis.clause).toBe('附件 二（六）')
    expect(age?.note).toContain('不足1个月必须写日龄')
  })

  it('names the required-field list through 附件1 rather than a generic physician-signature rule', async () => {
    const ruleset = await loadPack()
    const required = ruleset.rules.find((rule) => rule.id === 'MR-001')
    expect(required?.basis.clause).toBe('附件1 注')
    const signatures = ruleset.rules.find((rule) => rule.id === 'MR-009')
    expect(signatures?.basis.clause).toBe('附件 二（二十八）1')
    expect(signatures?.note).toContain('不得写成')
  })

  it('refuses a rule pack that overstates a principle-derived check', () => {
    const overstated = [
      'plugin: probe',
      'version: "0"',
      'rules:',
      '  - id: X-001',
      '    title: probe',
      '    severity: error',
      '    basis:',
      '      document: 《X》',
      '      number: X〔2020〕1号',
      '      clause: 第一条',
      '      excerpt: 这是一个足够长的逐字摘录示例。',
      '      kind: derived-from-principle',
      '      source: https://example.invalid/x',
    ].join('\n')
    expect(() => loadRuleset(overstated)).toThrow(/strongest permitted severity/)
  })
})

describe('paired fixtures', () => {
  it('has both a compliant and a violating sample for every rule', async () => {
    const ruleset = await loadPack()
    const covered = new Set<string>()
    for (const directory of await ruleDirectories()) {
      const cases = await readCases(directory)
      expect(cases.pairs.filter((pair) => pair.expect.count === 0).length, `${directory} compliant sample`).toBeGreaterThanOrEqual(1)
      expect(cases.pairs.filter((pair) => pair.expect.count > 0).length, `${directory} violating sample`).toBeGreaterThanOrEqual(1)
      for (const pair of cases.pairs) {
        const material = await readFile(join(fixturesRoot, directory, pair.material), 'utf8')
        const report = await runFixture(material, pair.material, cases.configure)
        const matched = issuesOf(report, cases.ruleId)
        expect(
          matched.length,
          `${directory}/${pair.name} expected ${pair.expect.count} × ${cases.ruleId}, got ${matched.map((issue) => issue.found).join(' | ')}`,
        ).toBe(pair.expect.count)
        covered.add(cases.ruleId)
      }
    }
    for (const rule of ruleset.rules) expect(covered.has(rule.id), `covered ${rule.id}`).toBe(true)
  })

  it('gives every issue a citable basis, a stable id and a locator', async () => {
    for (const directory of await ruleDirectories()) {
      const cases = await readCases(directory)
      for (const pair of cases.pairs) {
        const material = await readFile(join(fixturesRoot, directory, pair.material), 'utf8')
        const report = await runFixture(material, pair.material, cases.configure)
        for (const issue of report.issues) {
          expect(issue.basis).toContain('「')
          expect(issue.id).toMatch(/^dsh-medrec-qc\.MR-\d{3}\.[0-9a-f]{8}$/)
          expect(issue.found).not.toBe('')
          expect(issue.expected).not.toBe('')
          expect(Object.keys(issue.locator).length).toBeGreaterThan(0)
        }
        expect(Array.isArray(report.skipped)).toBe(true)
      }
    }
  })
})

describe('column dictionary', () => {
  it('maps the spellings that real exports use onto canonical keys', () => {
    const headers = ['病案号', 'ADMISSION_TIME', '出院日期时间', '（主要出院诊断）名称', '住院天数', '有手术操作']
    expect(resolveHeaders(headers, CASE_FIELDS)).toEqual([
      '病案号',
      '入院时间',
      '出院时间',
      '主要诊断名称',
      '实际住院天数',
      '有手术操作',
    ])
  })

  it('reports unmapped columns instead of silently ignoring them', () => {
    const input = parseMaterial(JSON.stringify({ cases: [{ 病案号: 'A1', 本院自定义列: 'x' }] }), 'inline')
    expect(input.unknownColumns).toContain('本院自定义列')
    expect(input.warnings.join(' ')).toContain('本院自定义列')
  })

  it('suggests a close spelling for a header that matched nothing', () => {
    expect(suggestHeader('性别代', CASE_FIELDS)).toBe('性别')
    expect(suggestHeader('完全无关的列名XYZ', CASE_FIELDS)).toBeUndefined()
  })

  it('canonicalizes assessment form names through the shared synonym map', () => {
    expect(canonicalize('压力性损伤风险评估', ASSESSMENT_SYNONYMS)).toBe('pressure-ulcer')
    expect(canonicalize('完全无关的表名', ASSESSMENT_SYNONYMS)).toBeUndefined()
  })
})

describe('skipped reporting', () => {
  it('admits which columns the export never provided', async () => {
    const material = asMaterial([goodCase({ 主要手术编码: undefined, 主要手术名称: undefined })])
    const report = await runFixture(material, 'inline')
    const entry = report.skipped.find((item) => item.rule === 'MR-008')
    expect(entry?.reason).toContain('主要手术编码')
  })

  it('treats a lone dash on a required field as the standard empty-content marker', async () => {
    const material = asMaterial([goodCase({ 科主任: '-' })])
    const report = await runFixture(material, 'inline')
    const found = report.issues
      .filter((issue) => issue.ruleId === 'MR-001')
      .map((issue) => `${issue.locator.column}:${issue.found}:${issue.expected}`)
    expect(found, `REPORT=${JSON.stringify(report.issues)}`).toEqual([])
  })

  it('still reports a dash in a signature column, because it means no signature', async () => {
    const report = await runFixture(asMaterial([goodCase({ 主任医师: '-' })]), 'inline')
    expect(issuesOf(report, 'MR-009').map((issue) => issue.found)).toEqual(['签名栏缺 主任（副主任）医师'])
  })

  it('names disabled rules exactly once and appends the configured note', async () => {
    const ruleset = await loadPack()
    const input = parseMaterial(asMaterial([goodCase()]), 'inline')
    const report = runCheck(input, ruleset, runOptions({ disabledRules: ['MR-013'], skipNotes: '本机构实施细则' }))
    const entries = report.skipped.filter((item) => item.rule === 'MR-013')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.reason).toContain('禁用')
    expect(entries[0]?.reason).toContain('本机构实施细则')
  })

  it('records the restricted run scope in one place', async () => {
    const ruleset = await loadPack()
    const input = parseMaterial(asMaterial([goodCase()]), 'inline')
    const report = runCheck(input, ruleset, runOptions({ onlyRules: ['MR-002'] }))
    const scope = report.skipped.filter((item) => item.reason.includes('only 参数'))
    expect(scope).toHaveLength(1)
    expect(scope[0]?.rule).toContain('MR-001')
  })
})

describe('report rendering', () => {
  it('never uses adjudicating wording and always carries the disclaimer', async () => {
    const material = await readFile(join(fixturesRoot, 'MR-014', 'MR-014-unsafe.yaml'), 'utf8')
    const report = await runFixture(material, 'MR-014-unsafe.yaml')
    const view = buildView(report)
    expect(findForbiddenWording(view.markdown)).toEqual([])
    expect(view.markdown).toContain('免责声明')
    expect(view.markdown).toContain('未执行的检查')
    expect(JSON.parse(view.reportJson)).toMatchObject({ plugin: pluginName, summary: report.summary })
  })
})

describe('plugin contract', () => {
  it('declares a static inject array covering every service apply touches', () => {
    expect(Array.isArray(inject)).toBe(true)
    expect(inject).toContain('tools')
  })

  it('exposes a Schemastery Config with serializable defaults', () => {
    const resolved = ConfigSchema(null)
    expect(resolved.rulesFile).toBe('rules/medrec-qc.yaml')
    expect(resolved.disabledRules).toEqual([])
    expect(resolved.timeoutMs).toBeGreaterThan(0)
  })

  it('resolves the packaged rule pack and rejects a missing one', () => {
    expect(resolvePackageFile('rules/medrec-qc.yaml')).toBe(rulesPath)
    expect(() => resolvePackageFile('rules/does-not-exist.yaml')).toThrow(/未找到/)
  })

  it('names the tool after the package family convention', () => {
    expect(TOOL_NAME).toBe('medrec_qc')
  })
})

describe('material reader', () => {
  it('rejects empty material instead of reporting an empty result', () => {
    expect(() => parseMaterial('   ', 'inline')).toThrow(/材料为空/)
  })

  it('rejects material without a cases list', () => {
    expect(() => parseMaterial('target: x', 'inline')).toThrow(/cases/)
  })

  it('accepts a bare list of cases', () => {
    const input = parseMaterial(JSON.stringify([{ 病案号: 'A1' }]), 'inline')
    expect(input.cases).toHaveLength(1)
  })
})

describe('shared kit', () => {
  it('parses wall-clock timestamps and rejects impossible dates', () => {
    expect(parseWallClock('2026-03-15 08:30')).toEqual({ date: '2026-03-15', time: '08:30', hasTime: true, minutes: 510 })
    expect(parseWallClock('2026-02-30')).toBeUndefined()
  })

  it('does calendar arithmetic for the length-of-stay rule', () => {
    expect(diffDays('2026-03-01', '2026-03-06')).toBe(5)
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01')
  })

  it('reads the supported YAML subset and rejects the rest', () => {
    expect(parseYaml('cases:\n  - row: 1\n    病案号: "A1"\n')).toEqual({ cases: [{ row: 1, 病案号: 'A1' }] })
    expect(() => parseYaml('a: 1\na: 2\n')).toThrow(/duplicate/)
  })
})
