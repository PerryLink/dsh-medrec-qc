#!/usr/bin/env node
/** CLI for the folder-level medrec runner. */
import { runBatch } from '../lib/batch.mjs'

const args = process.argv.slice(2)
const value = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const dir = value('--dir', '')
if (dir === '') {
  console.error('用法：dsh-medrec-batch --dir <目录> [--out result.json] [--recursive]')
  process.exit(2)
}
try {
  const result = await runBatch({
    dir,
    ...(value('--out', '') === '' ? {} : { outFile: value('--out', '') }),
    recursive: args.includes('--recursive'),
  })
  console.log(result.markdown)
  if (value('--out', '') !== '') console.error(`JSON written to ${value('--out', '')}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
