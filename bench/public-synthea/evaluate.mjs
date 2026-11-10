#!/usr/bin/env node
/**
 * Public-data end-to-end evaluation for dsh-medrec-qc.
 *
 * Input: Synthea FHIR Bundle (Apache-2.0), mapped by adapter.mjs.
 * Method: for each rule that the Synthea fields can support, take cases where
 * the rule does NOT fire as negatives, then clone one and inject that rule's
 * defect as a positive. This is a detection test over real-world-shaped rows,
 * not a claim that Synthea is a Chinese front sheet: staff fields and ICD
 * codes that Synthea does not carry are excluded or marked "-".
 *
 * Output: summary.json and a short Markdown table. The tool is the actual
 * registered dsh-medrec-qc tool from lib/, not a reimplementation.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as plugin from '../../lib/index.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const input = process.argv[2] ?? join(here, 'cases.json')
const positiveLimit = Number(process.argv[3] ?? 20)

const cases = JSON.parse(readFileSync(input, 'utf8')).cases
if (!Array.isArray(cases) || cases.length === 0) throw new Error('no cases')

const registered = []
plugin.apply({ tools: { register: (tool) => { registered.push(tool); return () => {} } } }, plugin.Config ? plugin.Config({}) : {})
const tool = registered.find((item) => item.name === plugin.TOOL_NAME)
if (!tool) throw new Error('medrec tool not registered')

const mutate = {
  'MR-001': (row) => ({ ...row, 病案号: '' }),
  'MR-002': (row) => ({ ...row, 入院时间: '2020-01-01' }),
  'MR-003': (row) => ({ ...row, 出院时间: '1900-01-01 00:00' }),
  'MR-004': (row) => ({ ...row, 实际住院天数: '999' }),
  'MR-005': (row) => ({ ...row, 主要诊断编码: '' }),
  'MR-007': (row) => ({ ...row, 有手术操作: '1', 主要手术名称: '胆囊切除术', 主要手术编码: '-' }),
  'MR-010': (row) => ({ ...row, 离院方式: 'X' }),
  'MR-014': (row) => ({ ...row, 性别: '1', 主要诊断名称: '妊娠状态' }),
  'MR-015': (row) => ({ ...row, 离院方式: '5', 死亡时间: '1999-01-01 00:00' }),
}

async function runOnly(rule, rows) {
  const result = await tool.execute({ material: JSON.stringify({ cases: rows }), only: [rule] }, { signal: new AbortController().signal })
  const report = JSON.parse(result.reportJson)
  return (report.issues ?? []).some((issue) => issue.ruleId === rule)
}

const byRule = []
for (const rule of Object.keys(mutate)) {
  const clean = []
  for (const [index, row] of cases.entries()) {
    const fired = await runOnly(rule, [row])
    if (!fired) clean.push(row)
  }
  if (clean.length === 0) {
    byRule.push({ rule, clean: 0, tp: 0, fp: 0, fn: 0, tn: 0, precision: null, recall: null, note: 'no clean base case' })
    continue
  }
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (let index = 0; index < Math.min(positiveLimit, clean.length); index += 1) {
    const base = clean[index]
    const positive = mutate[rule](base)
    const posRows = await runOnly(rule, [positive])
    if (posRows) tp += 1
    else fn += 1
    const negRows = await runOnly(rule, [base])
    if (negRows) fp += 1
    else tn += 1
  }
  const precision = tp + fp === 0 ? null : tp / (tp + fp)
  const recall = tp + fn === 0 ? null : tp / (tp + fn)
  byRule.push({ rule, clean: clean.length, tp, fp, fn, tn, precision, recall })
}

const total = { tp: 0, fp: 0, fn: 0, tn: 0 }
for (const row of byRule) { total.tp += row.tp; total.fp += row.fp; total.fn += row.fn; total.tn += row.tn }
const precision = total.tp + total.fp === 0 ? null : total.tp / (total.tp + total.fp)
const recall = total.tp + total.fn === 0 ? null : total.tp / (total.tp + total.fn)
const output = {
  dataset: 'Synthea sample_complete_patient.json (Apache-2.0)',
  source: 'https://github.com/synthetichealth/synthea/blob/master/src/test/resources/flexporter/sample_complete_patient.json',
  cases: cases.length,
  generatedAt: new Date().toISOString(),
  scope: 'detection on mapped Synthea rows; staff fields and ICD-specific rules excluded',
  excludedRules: ['MR-006', 'MR-008', 'MR-009', 'MR-011', 'MR-012', 'MR-013'],
  byRule,
  total: { ...total, precision, recall },
}
writeFileSync(join(here, 'summary.json'), JSON.stringify(output, null, 2) + '\n')
const fmt = (v) => v === null ? 'n/a' : v.toFixed(3)
console.log(`cases: ${cases.length}`)
console.log(`precision ${fmt(precision)} · recall ${fmt(recall)} (TP ${total.tp} FP ${total.fp} FN ${total.fn} TN ${total.tn})`)
for (const row of byRule) console.log(`  ${row.rule}: clean ${row.clean} TP ${row.tp} FP ${row.fp} FN ${row.fn} TN ${row.tn}`)
