/**
 * Folder-level runner for the medrec checker.
 *
 * The tool stays the review surface; this runner is the job surface. It walks a
 * directory, runs the same tool (including its optional document input) on each
 * file, and aggregates the outcomes without merging their findings.
 */

import { readdir, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { apply, Config, TOOL_NAME } from './index.ts'

const LEDGER_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.docx', '.xlsx', '.xlsm', '.csv', '.tsv'])

/** One file's outcome. */
export interface BatchFileResult {
  file: string
  ok: boolean
  issues?: number
  errors?: number
  warnings?: number
  infos?: number
  skipped?: number
  error?: string
}

/** Aggregate result. */
export interface BatchResult {
  dir: string
  files: BatchFileResult[]
  totals: { files: number; ok: number; failed: number; issues: number; errors: number; warnings: number; infos: number; skipped: number }
  markdown: string
  json: string
}

/** Options for {@link runBatch}. */
export interface BatchOptions {
  dir: string
  recursive?: boolean
  outFile?: string
}

async function listFiles(dir: string, recursive: boolean): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (recursive) out.push(...(await listFiles(path, recursive)))
      continue
    }
    if (LEDGER_EXTENSIONS.has(extname(entry.name).toLowerCase())) out.push(path)
  }
  return out.sort()
}

/**
 * Run the medrec tool over every supported file in a directory.
 *
 * @param options - directory and optional output path.
 * @returns per-file results, totals, and a Markdown/JSON summary.
 */
export async function runBatch(options: BatchOptions): Promise<BatchResult> {
  const dir = resolve(options.dir)
  const tools: { name: string; execute: (args: Record<string, unknown>, context: { signal: AbortSignal }) => Promise<Record<string, unknown>> }[] = []
  const ctx = { tools: { register: (tool: { name: string; execute: (args: Record<string, unknown>, context: { signal: AbortSignal }) => Promise<Record<string, unknown>> }) => { tools.push(tool); return () => {} } } }
  apply(ctx as unknown as Context, Config({ rulesFile: 'rules/medrec-qc.yaml', disabledRules: [], onlyRules: [], skipNotes: '', timeoutMs: 120000 }))
  const tool = tools.find((item) => item.name === TOOL_NAME)
  if (tool === undefined) throw new Error(`tool not registered: ${TOOL_NAME}`)

  const files = await listFiles(dir, options.recursive === true)
  const results: BatchFileResult[] = []
  for (const file of files) {
    try {
      const result = await tool.execute({ file }, { signal: new AbortController().signal })
      const report = JSON.parse(String(result.reportJson)) as { issues: unknown[]; summary: { error: number; warn: number; info: number }; skipped: unknown[] }
      results.push({
        file,
        ok: true,
        issues: report.issues.length,
        errors: report.summary.error,
        warnings: report.summary.warn,
        infos: report.summary.info,
        skipped: report.skipped.length,
      })
    } catch (error) {
      results.push({ file, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  const totals = {
    files: results.length,
    ok: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    issues: results.reduce((sum, item) => sum + (item.issues ?? 0), 0),
    errors: results.reduce((sum, item) => sum + (item.errors ?? 0), 0),
    warnings: results.reduce((sum, item) => sum + (item.warnings ?? 0), 0),
    infos: results.reduce((sum, item) => sum + (item.infos ?? 0), 0),
    skipped: results.reduce((sum, item) => sum + (item.skipped ?? 0), 0),
  }
  const lines = [
    '# 病案首页批量检查',
    '',
    `- 目录：${dir}`,
    `- 文件：${totals.files}（成功 ${totals.ok} · 失败 ${totals.failed}）`,
    `- 统计：错误 ${totals.errors} · 提示 ${totals.warnings} · 参考 ${totals.infos} · 跳过 ${totals.skipped}`,
    '',
    '| 文件 | 结果 | 错误 | 提示 | 参考 | 跳过 |',
    '|---|---|---:|---:|---:|---:|',
    ...results.map((item) => `| ${item.file} | ${item.ok ? 'OK' : `FAIL：${item.error ?? ''}`} | ${item.errors ?? 0} | ${item.warnings ?? 0} | ${item.infos ?? 0} | ${item.skipped ?? 0} |`),
    '',
    '> 批量结果只汇总每个文件各自的检查；未在单个文件中执行的规则仍不产生结论。',
  ]
  const json = JSON.stringify({ dir, files: results, totals }, null, 2)
  if (options.outFile !== undefined && options.outFile.trim() !== '') await writeFile(resolve(options.outFile), json)
  return { dir, files: results, totals, markdown: lines.join('\n'), json }
}

