# Results — Synthea public benchmark

Generated: 2026-11-10T11:40:32.661Z

Cases: 37; dataset: Synthea sample_complete_patient.json (Apache-2.0)

**Overall: precision 1.000 · recall 1.000 (TP 180 · FP 0 · FN 0 · TN 180)**

| rule | clean base | TP | FP | FN | TN | precision | recall |
|---|---:|---:|---:|---:|---:|---:|---:|
| MR-001 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |
| MR-002 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |
| MR-003 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |
| MR-004 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |
| MR-005 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |
| MR-007 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |
| MR-010 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |
| MR-014 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |
| MR-015 | 37 | 20 | 0 | 0 | 20 | 1.000 | 1.000 |

## Why this is not a real-world P/R

The positives are one-defect clones of Synthea rows. They test that each rule fires on its own defect and stays quiet on the clean row. They do not estimate prevalence, clinical validity, or Chinese front-sheet accuracy. Synthea is synthetic; SNOMED codes are not ICD-10; staff signatures are absent and use the explicit `未提供` sentinel.

## Excluded

Rules excluded because Synthea carries no ICD-10/ICD-9-CM-3 codes or newborn/staff data: MR-006, MR-008, MR-009, MR-011, MR-012, MR-013.

