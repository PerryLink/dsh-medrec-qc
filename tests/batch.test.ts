import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runBatch } from '../src/batch.ts'

const dirs: string[] = []
async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'medrec-batch-'))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})
const sample = readFile(join(import.meta.dirname, '..', 'samples', 'quickstart', 'input', 'MR-001-unsafe.yaml'), 'utf8')

describe('medrec folder batch', () => {
  it('runs every file and aggregates the totals', async () => {
    const dir = await temp()
    await writeFile(join(dir, 'a.yaml'), await sample)
    await writeFile(join(dir, 'b.yaml'), await sample)
    const result = await runBatch({ dir })
    expect(result.totals.files).toBe(2)
    expect(result.totals.ok).toBe(2)
    expect(result.markdown).toContain('a.yaml | OK')
  })

  it('keeps a bad file as a failure instead of aborting the folder', async () => {
    const dir = await temp()
    await writeFile(join(dir, 'good.yaml'), await sample)
    await writeFile(join(dir, 'bad.yaml'), 'not: [valid')
    const result = await runBatch({ dir })
    expect(result.totals.files).toBe(2)
    expect(result.totals.failed).toBe(1)
  })

  it('writes the aggregate JSON when asked', async () => {
    const dir = await temp()
    await writeFile(join(dir, 'a.yaml'), await sample)
    const out = join(dir, 'result.json')
    await runBatch({ dir, outFile: out })
    const written = JSON.parse(await readFile(out, 'utf8')) as { totals: { files: number } }
    expect(written.totals.files).toBe(1)
  })
})
