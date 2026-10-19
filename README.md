# dsh-medrec-qc — Form check and logic-contradiction prompts for the inpatient medical record front sheet

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```sh
dsh plugin --profile <name> add dsh-medrec-qc
```


[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)
[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-medrec-qc?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-medrec-qc?ref=badge)

`dsh-medrec-qc` reads an export of the inpatient medical record front sheet (病案首页), one row per discharge, in the column set of the national assessment export, the health statistics export or a hospital-local export, and checks that export's own form completeness, internal arithmetic and coding form: that each required column carries content or the `-` marker, that the admission and discharge times are present, precise to the minute and not in the wrong order, that the declared length of stay agrees with the two dates, that the primary diagnosis name and code and the primary operation name and code are filled together, that the codes have the written form the pack configures, that the three signature columns reflect three-level physician responsibility, that the discharge mode is one of the defined codes, that the age and the neonatal weights use the prescribed forms, that the count of other diagnoses stays within the configured ceiling, and that a diagnosis incompatible with the recorded sex or two disagreeing times in a death discharge are surfaced for human review.

## Install

```sh
dsh plugin --profile <name> add dsh-medrec-qc
dsh --profile <name> --dump-config | grep 'dsh-medrec-qc'
```

## What it looks like

![Workflow diagram for dsh-medrec-qc: call → plugin → result.](docs/assets/dsh-medrec-qc-flow.svg)

*Workflow overview: call → plugin → result. The examples below use the real command surface.*



## What it answers

### Examples

The table below is the example set: the first row is the detailed walkthrough, the remaining rows are short cases.

#### Detailed output

**Tool** `medrec_qc`

**Input**

~~~yaml
target: 2026 年 3 月出院病案首页导出
cases:
  - row: 1
    病案号: ""
    入院时间: "2026-03-01 08:30"
    出院时间: "2026-03-06 10:00"
~~~
 
**Output**

~~~json
{
  "id": "dsh-medrec-qc.MR-001.a58905f0",
  "ruleId": "MR-001",
  "severity": "error",
  "locator": {
    "row": 1,
    "column": "病案号"
  },
  "found": "「病案号」为空",
  "expected": "附件1 必填栏不能为空项，没有可填写内容时填写\"-\""
}
~~~

*Observed from `dsh-medrec-qc/tests/fixtures/MR-001/MR-001-unsafe.yaml`*

| You ask | What it answers |
|---|---|
| A required column is left empty, but I typed `-` in it. Is that reported? | No. `MR-001` treats a lone `-` as the marker for 'nothing to record here' and reports only the columns that are truly blank. It checks that a required column carries content, not that the content is correct. It is an `error` because 附件1's note now **has** been read verbatim (2026-10-13) — see the note below. The same `-` still counts as a missing signature under `MR-009`. |
| The admission time is written as a bare date with no hour or minute, and on one row the discharge time is earlier than the admission time. | `MR-002` reports a `入院时间` or `出院时间` value that can be read only to the day, because the recorded time must be precise to the minute, and it also reports a value it cannot parse as a date and time at all. `MR-003` compares the literal order of the two fields and reports the row where the discharge time comes first. Both work on the literal values and neither decides which of the two times is the true one. |
| The front sheet says `5` days, but the dates are 12 June in and 15 June out. | `MR-004` recounts the days as discharge date minus admission date and reports the row when the declared `实际住院天数` disagrees; admission and discharge on the same day count as `0` days, and a value that is not a whole number of days is reported too. It compares the three stored values only and does not decide which of them is wrong. |
| `主要诊断名称` is filled in but `主要诊断编码` is blank, and another row carries a code in a strange shape. | `MR-005` requires the two to be filled together and names the one that is missing; it checks only that both exist, not that the code matches the diagnosis. `MR-006` then tests the code against the written form configured in the pack, and it does not verify that the code exists in any version of the classification directory. |
| A batch contains no operation records at all. Do the operation rules pass in silence? | No. `MR-007` reports itself in `skipped` with the reason that the material holds no operation record, so the pairing check does not apply, instead of passing in silence. When a row does record an operation, the rule requires `主要手术名称` and `主要手术编码` to be filled together, and `MR-008` checks the written form of the operation code only. |
| A male patient's primary diagnosis is a pregnancy-related condition. Does that block the export? | `MR-014` reports it as a `warn`-level difference for a human to confirm, never as a block: the health-side documents contain no clause making a diagnosis incompatible with the recorded sex, and the published detail of that medical-insurance rule type does not cover the pregnancy, childbirth and puerperium chapter and allows clinical exceptions. Confirm with the clinician whether the sex or the diagnosis is wrong. |

## Standards it follows

| Document | Number | Cited by rules |
|---|---|---|
| 《住院病案首页数据质量管理与控制指标（2016版）》 | 国卫办医发〔2016〕24号 | MR-001 |
| 《住院病案首页数据填写质量规范（暂行）》 | 国卫办医发〔2016〕24号 | MR-002, MR-003, MR-005, MR-006, MR-007, MR-008, MR-013, MR-015 |
| 《卫生部关于修订住院病案首页的通知》 | 卫医政发〔2011〕84号 | MR-004, MR-009, MR-010, MR-011, MR-012 |
| 国家医疗保障局"两库"知识点（诊断与患者性别不符） | 国家医疗保障局公告（第二十一批） | MR-014 |

**Boundary:** this plugin checks the **front sheet of the inpatient medical record (病案首页)** — the
one-page discharge summary coders and the national assessment system read — for form completeness,
internal contradictions and coding form. It is not `dsh-nurse-record-check` (which checks nursing
documentation timeliness), not `dsh-icd-rule-check` (which checks ICD coding rules and dagger/asterisk
pairing), and it does not judge whether a diagnosis was clinically correct. It reads an export of the
front sheet and reports literal mismatches against cited clauses.

## Compatibility

| Surface | Status |
|---|---|
| Harness | Peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` — verified to accept both `0.2.0-rc.2` and `0.2.1-rc.2`. `engines.dsh` is declared as `>=0.2.1-0 <0.3.0` and is enforced by the host since 0.2.1 |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | All (plain ESM; no native code, no network, no model call) |
| Tool mode | Works in `native` and `ptc`; for a month of discharges use `ptc` |

## What it does

Registers the `medrec_qc` tool. It reads a list of discharged cases, applies a versioned rule pack,
and returns a report whose every finding names the clause it came from.

> ### Why `MR-001` is an `error` again (2026-10-13)
>
> **Every `error` rule here rests on a document that imposes the requirement *and* whose clause text has
> been read verbatim** — 国卫办医发〔2016〕24号 (obtained in full) and 卫医政发〔2011〕84号 (obtained in full,
> including all three attachments). `MR-001` was the long-standing exception: its only basis is
> **附件1's note**, and that attachment was recorded as a PDF this environment could not decode, so the rule
> was **downgraded to `warn` on 2026-10-07** under the same discipline — a clause that cannot be read does
> not block a workflow.
>
> **The attachment does have a text layer.** It was read verbatim on 2026-10-13: 328 pages, 205,847
> extractable characters, **no OCR used**. The note reads
> 「注：必填栏不能为空项，没有可填写内容时填写“-”」 — identical to the rule's `excerpt` except that the PDF
> prints curly quotes where the rule uses straight ones, a typographic difference recorded rather than
> papered over (the citation gate strips both quote forms, which is why the segment matches).
> **So the rule is back to `error`, corrected on evidence.**
>
> ⚠️ **Source tier, stated plainly**: `www.nhc.gov.cn` returns **HTTP 412** to automated requests
> (measured 2026-10-13; the site root is 412 too). The text was read from a **河南省病案质量控制中心**
> compilation — the very URL this rule's `source` has always carried. That is the same tier as the
> 高校／省级 reprints the other fourteen rules use, so it is **not a reason to treat this rule differently**.
> See `rules/evidence/clause-verification-homepage-attachment1.md` for the full attempt log and
> `rules/evidence/authority-class-audit.md` for the classification.

| Rule | Check | Severity |
|---|---|---|
| `MR-001` | no required column is blank (a lone `-` is the approved marker) | error |
| `MR-002` | admission and discharge times are present and precise to the minute | error |
| `MR-003` | the discharge time is not before the admission time | error |
| `MR-004` | the recorded length of stay matches the two dates | error |
| `MR-005` | the primary diagnosis name and code are filled together | error |
| `MR-006` | the primary diagnosis code has ICD-10 form | error |
| `MR-007` | when there is an operation, its name and code are filled together | error |
| `MR-008` | the primary operation code has ICD-9-CM-3 form | error |
| `MR-009` | the signature block reflects three-level physician responsibility | error |
| `MR-010` | the discharge mode is one of the defined codes | error |
| `MR-011` | the age uses integer years or the `N M/30 月` month fraction | warn |
| `MR-012` | neonatal weights are recorded to the nearest 10 grams | warn |
| `MR-013` | the count of other diagnoses stays within the configured ceiling | warn |
| `MR-014` | a diagnosis that does not match the recorded sex needs human review | warn |
| `MR-015` | a death discharge records the death time as the discharge time | info |

Column names are resolved through a shared dictionary, so the national-assessment export, the health
statistics export and a hospital-local export all feed the same rules. Columns the reader cannot map
are reported in `warnings` and `unknownColumns` rather than ignored — an unmapped column is exactly how
a check goes missing without anyone noticing.

## Configuration

Every tunable lives in the Schemastery schema in `src/config.ts`, so it can be changed from
`cordis.yml` without editing code. The per-rule field lists and thresholds live in
`rules/medrec-qc.yaml`.

| Key | Type | Default | Description |
|---|---|---|---|
| `rulesFile` | string | `rules/medrec-qc.yaml` | Rule-pack path, relative to the package root |
| `disabledRules` | string[] | `[]` | Rule ids to stop running; each appears in `skipped` |
| `onlyRules` | string[] | `[]` | Run only these rule ids; empty runs every rule |
| `skipNotes` | string | `""` | Note appended to every `skipped` reason |
| `timeoutMs` | number | `120000` | Cooperative tool timeout budget |

Rule-level parameters worth knowing:

- `MR-001` `fields` — the required-column list, taken from 附件1 of 国卫办医发〔2016〕24号. Extend it
  with your own mandatory columns without touching the code.
- `MR-011` `underOnePattern` / `adultPattern` — the accepted age spellings.
- `MR-013` `maxChecked` — the other-diagnosis count above which ordering is flagged for review.
- `MR-014` `rules` — the sex-versus-diagnosis term lists, expressed as `{ sex, label, pattern }`.

## Material format

The tool accepts JSON or YAML with a `cases` list (a bare list is also accepted). Field names are
matched against the dictionary, so `医院疾病诊断名称`-style local spellings resolve to the canonical
keys the rules read.

```yaml
cases:
  - row: 1
    病案号: "A2026030001"
    入院时间: "2026-03-01 08:30"
    出院时间: "2026-03-06 10:00"
    实际住院天数: "5"
    性别: "1"
    出生日期: "1972-05-04"
    年龄: "53"
    离院方式: "1"
    科主任: "赵主任"
    主任医师: "钱主任医师"
    主治医师: "孙主治"
    住院医师: "李医师"
    责任护士: "周护士"
    编码员: "吴编码"
    主要诊断名称: "2型糖尿病"
    主要诊断编码: "E11.900"
    其他诊断: "高血压;慢性肾功能不全"
    主要手术名称: "腹腔镜胆囊切除术"
    主要手术编码: "51.2300"
    有手术操作: "1"
```

Equivalent English headers such as `MEDICAL_RECORD_NO`, `ADMISSION_TIME`, `DISCHARGE_TIME` and
`MAIN_DIAGNOSIS_CODE` are accepted too, so a hospital that already exports ASCII headers does not
need a conversion step.

## Rule sources

Rule data lives in `rules/medrec-qc.yaml`. Every rule carries a document, a document number, a clause
in the source's own numbering, a verbatim excerpt and the URL the excerpt was read from. The loader
enforces that an excerpt is a real quotation of at least eight characters, and that a check whose
basis is only a general principle (`kind: derived-from-principle`, capped at `warn`) or a local policy
(`kind: institutional-configuration`, capped at `info`) may never be declared `error`.

The clause numbers were checked against the full texts of 《住院病案首页数据填写质量规范（暂行）》 and
《住院病案首页数据质量管理与控制指标（2016版）》（国卫办医发〔2016〕24号）,
《卫生部关于修订住院病案首页的通知》（卫医政发〔2011〕84号）附件, 《医疗机构病历管理规定（2013年版）》
（国卫医发〔2013〕31号） and 《医疗保障基金结算清单填写规范（试行）》（医保办发〔2020〕20号）.
Four findings shaped the pack, and are recorded here so a reviewer can see what was deliberately
**not** claimed:

1. **The required-field list is 附件1, and it has no column called "医师签名".** 附件1's 「住院病案首页
   必填项目列表」 runs to 76 items and lists the signature block as 科主任 / 主任（副主任）医师 /
   主治医师 / 住院医师. `MR-009` therefore binds to those specific columns and cites 84号文
   附件 二（二十八）1 for the three-level responsibility requirement, instead of writing "24号文
   requires a physician signature".
2. **The age format is in 84号文, not in the 2010 病历书写规范.** The rule for ages under one year
   (`N M/30 月`) is 卫医政发〔2011〕84号 附件 二（六）. 11号文 mentions age only as a field of the
   admission note. `MR-011` cites 84号文, and does **not** check a "write day-age under one month"
   rule, because no national document states one — and 医保办发〔2020〕20号 states a different rule
   (integer day-age) for the insurance channel, so the two are not made mutually exclusive.
3. **"A male patient cannot have a pregnancy diagnosis" is not a national clause.** The National
   Healthcare Security Administration publishes a "diagnosis does not match patient sex" rule type,
   but the released detail covers eleven ICD-10 chapters (A/B/C/D/E/F/I/J/K/L/M) and contains **no O
   chapter entry at all**; the accompanying press briefing explicitly allows clinical exceptions.
   `MR-014` is therefore a `warn`-level lead for human review, never a block.
4. **A death discharge has no independent clause tying it to a death time.** 24号文 第八条 only
   defines the discharge time as the death time for deceased patients. `MR-015` rests on that
   definition, is capped at `info`, and says so in its own note.

## Troubleshooting

- **The plugin installs but the tool never appears.** Check that `main` resolves to `lib/index.mjs`
  and that `pnpm run build` produced it; a wrong `main` makes the loader skip the entry silently.
- **A check you expected did not run.** Read the `skipped` array: it names the rule and, when the
  cause is an absent column, which column was missing. `MR-008` stays skipped on an export without
  operation columns, for example.
- **A column you know exists is reported as unknown.** Add its spelling to `CASE_FIELDS` in
  `src/parse.ts` (or to your own rule pack's field list) — the reader deliberately refuses to guess.
- **`dsh plugin add` refuses the package as incompatible.** The peer range covers `0.1.x` and `0.2.x`;
  if your runtime sits outside it, grant an explicit exemption:
  `dsh plugin --profile <name> allow-version dsh-medrec-qc@0.1.0 --dsh-version <runtime> --accept-risk`
- **`check` reports `manifest-peers` as failed.** The static checker compares against a hard-coded peer
  range that predates the 0.2 line. The runtime enforces peer compatibility at install time, so the
  declared range is the correct one; this is a known upstream issue in `dsh-plugin-dev`.

## Development

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm test            # vitest, paired fixtures per rule
pnpm run build       # tsdown -> lib/index.mjs + lib/index.d.mts
node ../scripts/sync-shared.mjs dsh-medrec-qc   # refresh src/shared from ../_shared
```

## PerryLink DSH Plugin Family

This project is part of the DeepSeek Harness plugin family from [PerryLink](https://github.com/PerryLink). The roster stays collapsed below so every README keeps a short first screen; expand it to see every row and its status.

<details>
<summary>Expand all plugins</summary>

| Plugin | Status |
|---|---|
| **[dsh-aqua-input-check](https://github.com/PerryLink/dsh-aqua-input-check)** |  |
| **[dsh-archive-check](https://github.com/PerryLink/dsh-archive-check)** |  |
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** |  |
| **[dsh-autotier](https://github.com/PerryLink/dsh-autotier)** |  |
| **[dsh-bid-ca-precheck](https://github.com/PerryLink/dsh-bid-ca-precheck)** |  |
| **[dsh-bid-qual-check](https://github.com/PerryLink/dsh-bid-qual-check)** |  |
| **[dsh-cert-mcp](https://github.com/PerryLink/dsh-cert-mcp)** |  |
| **[dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)** |  |
| **[dsh-click](https://github.com/PerryLink/dsh-click)** |  |
| **[dsh-composer-history](https://github.com/PerryLink/dsh-composer-history)** |  |
| **[dsh-contract-stance](https://github.com/PerryLink/dsh-contract-stance)** |  |
| **[dsh-customs-doc-check](https://github.com/PerryLink/dsh-customs-doc-check)** |  |
| **[dsh-data-quality](https://github.com/PerryLink/dsh-data-quality)** |  |
| **[dsh-demurrage-ledger](https://github.com/PerryLink/dsh-demurrage-ledger)** |  |
| **[dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)** |  |
| **[dsh-drill-script-check](https://github.com/PerryLink/dsh-drill-script-check)** |  |
| **[dsh-eia-guide-check](https://github.com/PerryLink/dsh-eia-guide-check)** |  |
| **[dsh-emergency-plan](https://github.com/PerryLink/dsh-emergency-plan)** |  |
| **[dsh-essay-rubric-check](https://github.com/PerryLink/dsh-essay-rubric-check)** |  |
| **[dsh-evidence-check](https://github.com/PerryLink/dsh-evidence-check)** |  |
| **[dsh-export-ctl-check](https://github.com/PerryLink/dsh-export-ctl-check)** |  |
| **[dsh-fast](https://github.com/PerryLink/dsh-fast)** |  |
| **[dsh-fmea-table-check](https://github.com/PerryLink/dsh-fmea-table-check)** |  |
| **[dsh-forecast-penalty](https://github.com/PerryLink/dsh-forecast-penalty)** |  |
| **[dsh-fund-research](https://github.com/PerryLink/dsh-fund-research)** |  |
| **[dsh-github](https://github.com/PerryLink/dsh-github)** |  |
| **[dsh-gongwen-flow-check](https://github.com/PerryLink/dsh-gongwen-flow-check)** |  |
| **[dsh-gongwen-word-check](https://github.com/PerryLink/dsh-gongwen-word-check)** |  |
| **[dsh-guard-plan-qc](https://github.com/PerryLink/dsh-guard-plan-qc)** |  |
| **[dsh-hazchem-check](https://github.com/PerryLink/dsh-hazchem-check)** |  |
| **[dsh-hazplan-check](https://github.com/PerryLink/dsh-hazplan-check)** |  |
| **[dsh-hidden-risk-map](https://github.com/PerryLink/dsh-hidden-risk-map)** |  |
| **[dsh-hs-classify](https://github.com/PerryLink/dsh-hs-classify)** |  |
| **[dsh-icd-rule-check](https://github.com/PerryLink/dsh-icd-rule-check)** |  |
| **[dsh-industry-research](https://github.com/PerryLink/dsh-industry-research)** |  |
| **[dsh-lawcite-adapter](https://github.com/PerryLink/dsh-lawcite-adapter)** |  |
| **[dsh-laya](https://github.com/PerryLink/dsh-laya)** |  |
| **[dsh-lc-doc-check](https://github.com/PerryLink/dsh-lc-doc-check)** |  |
| **[dsh-learning-gap-check](https://github.com/PerryLink/dsh-learning-gap-check)** |  |
| **[dsh-library](https://github.com/PerryLink/dsh-library)** |  |
| **[dsh-local-ai](https://github.com/PerryLink/dsh-local-ai)** |  |
| **[dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions)** |  |
| **[dsh-mask](https://github.com/PerryLink/dsh-mask)** |  |
| **[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)** |  |
| **[dsh-medrec-qc](https://github.com/PerryLink/dsh-medrec-qc)** |  |
| **[dsh-memento](https://github.com/PerryLink/dsh-memento)** |  |
| **[dsh-nsfc-form-check](https://github.com/PerryLink/dsh-nsfc-form-check)** |  |
| **[dsh-nurse-record-check](https://github.com/PerryLink/dsh-nurse-record-check)** |  |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** |  |
| **[dsh-origin-rvc-check](https://github.com/PerryLink/dsh-origin-rvc-check)** |  |
| **[dsh-ota-review-check](https://github.com/PerryLink/dsh-ota-review-check)** |  |
| **[dsh-output-styles](https://github.com/PerryLink/dsh-output-styles)** |  |
| **[dsh-paper-doc-adapter](https://github.com/PerryLink/dsh-paper-doc-adapter)** |  |
| **[dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules)** |  |
| **[dsh-permit-report-check](https://github.com/PerryLink/dsh-permit-report-check)** |  |
| **[dsh-pipeline-check](https://github.com/PerryLink/dsh-pipeline-check)** |  |
| **[dsh-pleading-draft](https://github.com/PerryLink/dsh-pleading-draft)** |  |
| **[dsh-plugin-doctor](https://github.com/PerryLink/dsh-plugin-doctor)** |  |
| **[dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)** |  |
| **[dsh-plugin-kit](https://github.com/PerryLink/dsh-plugin-kit)** |  |
| **[dsh-plugin-upgrade](https://github.com/PerryLink/dsh-plugin-upgrade)** |  |
| **[dsh-policy-brief-draft](https://github.com/PerryLink/dsh-policy-brief-draft)** |  |
| **[dsh-power-loss-split](https://github.com/PerryLink/dsh-power-loss-split)** |  |
| **[dsh-power-ticket-check](https://github.com/PerryLink/dsh-power-ticket-check)** |  |
| **[dsh-ppap-check](https://github.com/PerryLink/dsh-ppap-check)** |  |
| **[dsh-protest-deadline](https://github.com/PerryLink/dsh-protest-deadline)** |  |
| **[dsh-railway-window](https://github.com/PerryLink/dsh-railway-window)** |  |
| **[dsh-repair-order-qc](https://github.com/PerryLink/dsh-repair-order-qc)** |  |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** |  |
| **[dsh-review-reply-check](https://github.com/PerryLink/dsh-review-reply-check)** |  |
| **[dsh-rulefile-check](https://github.com/PerryLink/dsh-rulefile-check)** |  |
| **[dsh-safety-brief-check](https://github.com/PerryLink/dsh-safety-brief-check)** |  |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** |  |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** |  |
| **[dsh-site-log-check](https://github.com/PerryLink/dsh-site-log-check)** |  |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** |  |
| **[dsh-soe-decision-check](https://github.com/PerryLink/dsh-soe-decision-check)** |  |
| **[dsh-soilwater-check](https://github.com/PerryLink/dsh-soilwater-check)** |  |
| **[dsh-sop-sync-check](https://github.com/PerryLink/dsh-sop-sync-check)** |  |
| **[dsh-spc-gbt-adapter](https://github.com/PerryLink/dsh-spc-gbt-adapter)** |  |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** |  |
| **[dsh-tender-extract](https://github.com/PerryLink/dsh-tender-extract)** |  |
| **[dsh-tender-matrix](https://github.com/PerryLink/dsh-tender-matrix)** |  |
| **[dsh-test-drive](https://github.com/PerryLink/dsh-test-drive)** |  |
| **[dsh-ticktick](https://github.com/PerryLink/dsh-ticktick)** |  |
| **[dsh-translate](https://github.com/PerryLink/dsh-translate)** |  |
| **[dsh-warranty-calc](https://github.com/PerryLink/dsh-warranty-calc)** |  |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | 🧊 FROZEN — see the repo README |
| **[dsh-claude-move](https://github.com/PerryLink/dsh-claude-move)** | 🧊 FROZEN — see the repo README |
| **[dsh-defend](https://github.com/PerryLink/dsh-defend)** | 🧊 FROZEN — see the repo README |
| **[dsh-draw](https://github.com/PerryLink/dsh-draw)** | 🧊 FROZEN — see the repo README |
| **[dsh-reach](https://github.com/PerryLink/dsh-reach)** | 🧊 FROZEN — see the repo README |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | 🚫 RETIRED — see the repo README |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | 🚫 RETIRED — see the repo README |
| **[dsh-team-rooms](https://github.com/PerryLink/dsh-team-rooms)** | 🚫 RETIRED — see the repo README |

</details>

## License

[Apache License 2.0](LICENSE) © 2026 dsh-medrec-qc contributors.
