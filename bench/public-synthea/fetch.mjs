#!/usr/bin/env node
/**
 * Fetch the public Synthea FHIR sample used by this benchmark.
 *
 * Source: synthetichealth/synthea, src/test/resources/flexporter/sample_complete_patient.json
 * License: Apache-2.0 (Synthea and its generated output).
 *
 * The file is intentionally not committed: it is public data with its own
 * release cadence, and the repository should stay small. The benchmark is
 * reproducible with `node fetch.mjs`, which pins the upstream commit URL
 * through GitHub's raw endpoint.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '.data', 'sample_complete_patient.json')
const url = 'https://raw.githubusercontent.com/synthetichealth/synthea/master/src/test/resources/flexporter/sample_complete_patient.json'

const response = await fetch(url)
if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`)
const text = await response.text()
if (!text.trimStart().startsWith('{')) throw new Error('download did not return JSON')
await mkdir(dirname(target), { recursive: true })
await writeFile(target, text)
console.log(`wrote ${target} (${text.length} bytes)`)
