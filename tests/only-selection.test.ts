import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { apply, Config, TOOL_NAME } from '../src/index.ts'

describe('only selection', () => {
  it('suppresses findings from unselected rules', async () => {
    const registered: any[] = []
    apply({ tools: { register: (tool: any) => { registered.push(tool); return () => {} } } } as any, Config({}))
    const tool = registered.find((item) => item.name === TOOL_NAME)
    expect(tool).toBeDefined()
    const file = join(import.meta.dirname, '..', 'samples', 'quickstart', 'input', 'MR-001-unsafe.yaml')
    const result = await tool.execute({ file, only: ['MR-004'] }, { signal: new AbortController().signal })
    const report = JSON.parse(result.reportJson) as { issues: { ruleId: string }[] }
    expect(report.issues.every((issue) => issue.ruleId === 'MR-004')).toBe(true)
  })
})
