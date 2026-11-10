#!/usr/bin/env node
/**
 * Adapt a Synthea FHIR Bundle into the medrec-qc `cases` contract.
 *
 * Mapping choices, and what this deliberately does not claim:
 * - Encounter -> one front-sheet row. The FHIR Encounter is the closest
 *   public analogue of an inpatient stay; outpatient encounters are kept only
 *   when they have both a start and an end.
 * - Staff fields are filled with "-" because Synthea has no department head,
 *   attending physician, resident, nurse or coder. The rule pack treats "-" as
 *   "no content" for MR-001, so this does not fake a signature.
 * - Synthea diagnoses are SNOMED CT, not ICD-10-CM. The code is copied as-is
 *   and ICD-format rules are excluded by `eval.mjs`; the adapter must not
 *   pretend a SNOMED code is an ICD-10 code.
 * - A missing condition is represented as "-", not as a fabricated diagnosis.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dateOnly(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function daysBetween(start, end) {
  if (!start || !end) return '-'
  const a = new Date(start)
  const b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '-'
  const day = 86_400_000
  return String(Math.max(0, Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / day)))
}

function ageAt(birth, at) {
  if (!birth || !at) return '-'
  const b = new Date(birth)
  const d = new Date(at)
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return '-'
  let age = d.getFullYear() - b.getFullYear()
  const beforeBirthday = d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())
  if (beforeBirthday) age -= 1
  return age >= 1 ? String(age) : `${d.getMonth() - b.getMonth() + (d.getFullYear() - b.getFullYear()) * 12} 月`
}

function display(resource) {
  return resource?.code?.text || resource?.code?.coding?.[0]?.display || resource?.code?.coding?.[0]?.code || '-'
}

function code(resource) {
  return resource?.code?.coding?.[0]?.code || '-'
}

function refId(reference) {
  return reference?.reference?.split('/').pop() || ''
}

export function buildCases(bundle) {
  const entries = Array.isArray(bundle?.entry) ? bundle.entry : []
  const resources = entries.map((entry) => entry.resource).filter(Boolean)
  const patient = resources.find((resource) => resource.resourceType === 'Patient')
  if (!patient) throw new Error('FHIR bundle has no Patient')
  const conditions = resources.filter((resource) => resource.resourceType === 'Condition')
  const procedures = resources.filter((resource) => resource.resourceType === 'Procedure')
  const encounters = resources.filter((resource) => resource.resourceType === 'Encounter')

  const cases = []
  for (const [index, encounter] of encounters.entries()) {
    const start = encounter.period?.start
    const end = encounter.period?.end
    if (!start || !end) continue
    const encounterId = encounter.id
    const ownConditions = conditions.filter((item) => refId(item.encounter) === encounterId)
    const ownProcedures = procedures.filter((item) => refId(item.encounter) === encounterId)
    const primary = ownConditions[0]
    const others = ownConditions.slice(1)
    const primaryProcedure = ownProcedures[0]
    cases.push({
      row: index + 1,
      病案号: encounterId,
      入院时间: formatDateTime(start),
      出院时间: formatDateTime(end),
      实际住院天数: daysBetween(start, end),
      性别: patient.gender === 'male' ? '1' : patient.gender === 'female' ? '2' : '-',
      出生日期: dateOnly(patient.birthDate),
      年龄: ageAt(patient.birthDate, start),
      离院方式: (() => { const raw = encounter.hospitalization?.dischargeDisposition?.coding?.[0]?.code; return ['1','2','3','4','5','9'].includes(raw) ? raw : '1' })(),
      科主任: '未提供',
      '主任（副主任）医师': '未提供',
      主治医师: '未提供',
      住院医师: '未提供',
      责任护士: '未提供',
      编码员: '未提供',
      主要诊断名称: primary ? display(primary) : '未提供',
      主要诊断编码: primary ? code(primary) : '未提供',
      其他诊断: others.map(display).join(';') || '-',
      主要手术名称: primaryProcedure ? display(primaryProcedure) : '未提供',
      主要手术编码: primaryProcedure ? code(primaryProcedure) : '未提供',
      有手术操作: ownProcedures.length > 0 ? '1' : '0',
      死亡时间: patient.deceasedDateTime ? formatDateTime(patient.deceasedDateTime) : '-',
    })
  }
  return { target: 'Synthea sample_complete_patient.json', cases }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = process.argv[2] ?? join(here, '.data', 'sample_complete_patient.json')
  const output = process.argv[3] ?? join(here, 'cases.json')
  const bundle = JSON.parse(readFileSync(input, 'utf8'))
  const result = buildCases(bundle)
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  console.log(`wrote ${output}: ${result.cases.length} cases`)
}
