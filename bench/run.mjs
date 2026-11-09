/**
 * Rule-level synthetic benchmark.
 *
 * The corpus is assembled from the repository's hand-written unsafe/compliant
 * pairs. It is a regression signal, not a real-world P/R: the cases are small,
 * hand-made, and deliberately one-defect-each. Precision = TP/(TP+FP) and
 * recall = TP/(TP+FN) over each labelled rule.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as plugin from '../lib/index.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const labels = JSON.parse(readFileSync(join(here, 'labels.json'), 'utf8'))

const registered = []
plugin.apply({ tools: { register: (tool) => { registered.push(tool); return () => {} } } }, plugin.Config ? plugin.Config({}) : {})
const tool = registered.find((item) => item.name === plugin.TOOL_NAME)
if (!tool) throw new Error(`tool not registered: ${plugin.TOOL_NAME}`)

const byRule = new Map()
for (const label of labels) {
  const entry = byRule.get(label.ruleId) ?? { tp: 0, fp: 0, fn: 0, tn: 0 }
  const text = readFileSync(join(here, label.file), 'utf8')
  const result = await tool.execute({ material: text }, { signal: new AbortController().signal })
  const report = JSON.parse(result.reportJson)
  const fired = report.issues.some((issue) => issue.ruleId === label.ruleId)
  if (label.positive) {
    if (fired) entry.tp += 1
    else entry.fn += 1
  } else if (fired) {
    entry.fp += 1
  } else {
    entry.tn += 1
  }
  byRule.set(label.ruleId, entry)
}

let tp = 0, fp = 0, fn = 0, tn = 0
for (const entry of byRule.values()) {
  tp += entry.tp; fp += entry.fp; fn += entry.fn; tn += entry.tn
}
const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
const rows = [...byRule.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([rule, e]) => ({ rule, ...e }))
const out = { corpus: labels.length, rules: byRule.size, tp, fp, fn, tn, precision, recall, f1, byRule: rows }
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`corpus: ${out.corpus} cases / ${out.rules} rules`)
  console.log(`precision ${precision.toFixed(3)} · recall ${recall.toFixed(3)} · F1 ${f1.toFixed(3)} (TP ${tp} · FP ${fp} · FN ${fn} · TN ${tn})`)
  for (const row of rows) console.log(`  ${row.rule}: TP ${row.tp} FP ${row.fp} FN ${row.fn} TN ${row.tn}`)
}
if (precision < 0.9 || recall < 0.9) {
  console.error('benchmark gate failed: precision and recall must both be >= 0.90')
  process.exit(1)
}
