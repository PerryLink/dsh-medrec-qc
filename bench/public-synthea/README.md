# Public-data end-to-end benchmark: Synthea

This directory runs the **actual** `dsh-medrec-qc` tool over rows adapted
from public synthetic FHIR data. It is a public, reproducible complement to
the hand-written `bench/` corpus — not a substitute for a Chinese hospital
front-sheet validation.

## Data

- **Synthea** sample: `sample_complete_patient.json`
  - Source: <https://github.com/synthetichealth/synthea/blob/master/src/test/resources/flexporter/sample_complete_patient.json>
  - License: **Apache-2.0** (Synthea and its generated output)
  - The file is downloaded by `fetch.mjs`; it is not committed.

## Method

1. `fetch.mjs` downloads the FHIR Bundle.
2. `adapter.mjs` maps each `Encounter` with a start and end to one `cases` row:
   dates, length of stay, sex, birth date, age, discharge disposition,
   primary/other diagnoses and procedures.
3. `evaluate.mjs` registers the real tool from `../../lib/index.mjs`, takes
   cases where a rule does **not** fire as negatives, clones one and injects
   that rule's defect as a positive. It computes per-rule precision/recall.
4. `summary.json` and `RESULTS.md` record the run.

## Honest limits

- Synthea is **synthetic**, not real patient data. It is public and
  Apache-2.0, which is why it can be redistributed; it is not evidence of
  performance on Chinese records.
- Synthea uses **SNOMED CT**, not ICD-10-CM/ICD-9-CM-3. Rules that require
  those formats (`MR-006`, `MR-008`) are excluded. A SNOMED code is copied
  as-is; it is never presented as an ICD code.
- Synthea has no department head, attending, resident, nurse or coder. These
  fields use the explicit sentinel `未提供` so the required-field and
  signature rules do not produce fake passes; this is a data limitation, not
  a hospital signature.
- Missing diagnoses/procedures use `未提供` for the same reason.
- **The P/R numbers measure detection on injected defects, not real-world
  prevalence.** The positives are one-defect clones; they are useful as a
  regression/public baseline, not as a claim of clinical accuracy.
- The `only` option in the current tool does not suppress a few always-on
  checks (`MR-005`, `MR-009`); evaluation filters by the target `ruleId`.
  This is a tool behavior gap worth fixing.

## Run

```bash
node bench/public-synthea/fetch.mjs
node bench/public-synthea/adapter.mjs bench/public-synthea/.data/sample_complete_patient.json bench/public-synthea/cases.json
node bench/public-synthea/evaluate.mjs bench/public-synthea/cases.json 20
```

`fetch.mjs` needs network access to GitHub. No token or private data is used.
