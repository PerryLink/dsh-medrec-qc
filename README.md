# dsh-medrec-qc

**Boundary:** this plugin checks the **front sheet of the inpatient medical record (病案首页)** — the
one-page discharge summary coders and the national assessment system read — for form completeness,
internal contradictions and coding form. It is not `dsh-nurse-record-check` (which checks nursing
documentation timeliness), not `dsh-icd-rule-check` (which checks ICD coding rules and dagger/asterisk
pairing), and it does not judge whether a diagnosis was clinically correct. It reads an export of the
front sheet and reports literal mismatches against cited clauses.

## Compatibility

| Surface | Status |
|---|---|
| Harness | Peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` — verified to accept both `0.2.0-rc.2` and `0.2.1-alpha.1`. `engines.dsh` is deliberately not declared: it has no reader and cannot reject a host |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | All (plain ESM; no native code, no network, no model call) |
| Tool mode | Works in `native`, `ptc` and `both`; for a month of discharges use `ptc` |

## What it does

Registers the `medrec_qc` tool. It reads a list of discharged cases, applies a versioned rule pack,
and returns a report whose every finding names the clause it came from.

> ### ⚠️ Why `MR-001` is only a `warn`
>
> **Every `error` rule here rests on a document that imposes the requirement *and* whose clause text has
> been read verbatim** — 国卫办医发〔2016〕24号 (obtained in full) and 卫医政发〔2011〕84号 (obtained in full,
> including all three attachments). `MR-001` is the exception: its only basis is **附件1's header note**,
> and that attachment is a PDF this environment cannot decode. The nearest obtained wording —
> 84号文附件2 一（三）「栏目中没有可填写内容的，填写"-"」 — says **how to fill a blank**, not that a
> required field may not be left blank, so it cannot carry an `error`. A rule whose clause cannot be read
> does not block a workflow. See `rules/evidence/authority-class-audit.md` for the full classification.

| Rule | Check | Severity |
|---|---|---|
| `MR-001` | no required column is blank (a lone `-` is the approved marker) | warn |
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

## Install

```sh
dsh plugin --profile <name> add dsh-medrec-qc
dsh --profile <name> --dump-config | grep 'dsh-medrec-qc'
```

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

## License

[Apache License 2.0](LICENSE) © 2026 dsh-medrec-qc contributors.
