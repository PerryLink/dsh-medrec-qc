# dsh-medrec-qc — 病案首页形式质控与逻辑矛盾提示

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)

`dsh-medrec-qc` 读取一份住院病案首页导出表，每行一例出院病例，列名可以是国家绩效考核导出、卫生统计导出或医院本地导出的写法，核对这份材料自身的形式齐备、内部算术与编码形式：必填栏目是否有内容或按规范填写 `-`、入院时间与出院时间是否填写且精确到分钟且前后不倒置、填写的实际住院天数是否与两个日期一致、主要诊断的名称与编码以及主要手术的名称与编码是否同时填写、编码是否符合规则库配置的书写形式、三级医师签名栏是否齐全、离院方式是否为规定代码、年龄与新生儿体重是否使用规定形式、其他诊断条数是否在配置上限内，以及诊断与性别不相容、死亡病例两条时间不一致等需人工核实的情形是否被列出。

## 实际输出长什么样

![Terminal demo of dsh-medrec-qc: real output over its MR-009 fixture](https://raw.githubusercontent.com/PerryLink/dsh-medrec-qc/main/docs/assets/dsh-medrec-qc-demo.png)

本插件对自己 `MR-009` 测试夹具的**真实输出**，不是示意图。规则库不伪造引文，因此每条发现都会同时写明所引条款，以及该条款原文本次未取得。

## 它回答什么问题

| 你会问 | 它怎么答 |
|---|---|
| 某个必填栏目是空的，但我填了 `-`，会被报出来吗？ | 不会。`MR-001` 把单独一个 `-` 视为「没有可填写内容」的标注，只报真正留空的栏目。它核对的是必填栏目有没有内容，不判断内容填得对不对；由于本条所引附件是 PDF、本环境无法解码，它的严重级封顶为 `warn`。同一个 `-` 在 `MR-009` 里仍然算签名缺失。 |
| 入院时间只写到日、没有时分，还有一行的出院时间早于入院时间。 | `MR-002` 会报出只能读到日的 `入院时间` 或 `出院时间`（记录时间应当精确到分钟），完全解析不成日期时间的取值也一并报出。`MR-003` 按两个字段本身的字面先后关系，报出出院时间在前的那一行。两条都只看字面取值，不判断哪个时间才是真实时间。 |
| 首页上写的是 5 天，而入出院日期是 6 月 12 日入院、6 月 15 日出院。 | `MR-004` 按「出院日 − 入院日」重算天数，与填写的 `实际住院天数` 不符即报出该行；同日入出院计 `0` 天，填的不是整数天也会报出。它只比对这三个已填的值，不判断其中哪一个填错了。 |
| `主要诊断名称` 填了、`主要诊断编码` 空着；另一行的编码写法很怪。 | `MR-005` 要求两者同时填写，并指出缺的是哪一项；它只核对两者是否同时存在，不判断编码与诊断是否对应。`MR-006` 再按规则库中配置的书写形式核对编码，不校验该编码是否存在于某一版本的分类目录中。 |
| 一批材料里完全没有手术操作记录，手术类规则会静默通过吗？ | 不会。`MR-007` 会在 `skipped` 中报告「材料中没有手术或操作记录、配对检查不适用」，而不是静默通过。某一病例确实记录了手术时，本条要求 `主要手术名称` 与 `主要手术编码` 同时填写，`MR-008` 只核对手术编码的书写形式。 |
| 男性患者的主要诊断是妊娠相关疾病，会阻断上报吗？ | `MR-014` 只作为 `warn` 级差异提示人工核实，从不作阻断：卫生口径文件中没有「诊断必须与性别相容」的条款，医保侧该规则类型的已公开明细未覆盖妊娠分娩产褥期章节，并允许临床合理性例外。请与临床确认是性别填错还是诊断填错。 |

## 依据的标准

| 文件 | 文号 | 引用它的规则 |
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

| 项目 | 状态 |
|---|---|
| Harness | 对等版本范围 `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` —— 已实测同时接受 `0.2.0-rc.2` 与 `0.2.1-alpha.1`。**刻意不声明 `engines.dsh`**：它没有任何读取者，也无法拒装任何宿主 |
| Node | `^22.19.0 || >=24.0.0` |
| 平台 | 全平台（纯 ESM；无原生代码、无联网、不调用模型） |
| 工具模式 | `native` / `ptc` / `both` 均可；批量校验整个目录时建议 `ptc`，schema 成本只付一次 |

## What it does

规则表、字段说明与行为细节见 [README.md](README.md#what-it-does)（英文主版本）。本插件只列出材料与所引条款之间的字面差异，并对无法执行的检查在 `skipped` 中逐项说明。

## Install

```sh
dsh plugin --profile <name> add dsh-medrec-qc
dsh --profile <name> --dump-config | grep 'dsh-medrec-qc'
```

## Configuration

全部可调参数都在 `src/config.ts` 的 Schemastery schema 中，只改 `cordis.yml` 即可生效，无需改代码；逐条阈值在 `rules/` 下的规则库文件里。

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `rulesFile` | string | `rules/medrec-qc.yaml` | 规则库文件路径，相对插件包根目录 |
| `disabledRules` | string[] | `[]` | 要停用的规则 id 列表；每条都会出现在 `skipped` 中 |
| `onlyRules` | string[] | `[]` | 只执行这些规则 id；留空表示执行全部规则 |
| `skipNotes` | string | `""` | 附加到每条 `skipped` 说明后的备注 |
| `timeoutMs` | number | `120000` | 工具协作式超时预算（毫秒） |

## Material format

支持 JSON 与 YAML。完整字段示例见 [README.md](README.md#material-format)（英文主版本）。字段在读取层是可选的，由检查引擎校验，因此部分导出的材料会产生"缺项"类差异，而不是让程序崩溃。

## Rule sources

规则数据与代码分离，每条规则都带文件名、文号、按原文自身编号体系的条款号、逐字摘录与来源地址。加载期强制：摘录必须是真实引文且不少于八个字符；依据仅为原则性条款（`kind: derived-from-principle`，严重级上限 `warn`）或本机构配置（`kind: institutional-configuration`，上限 `info`）的检查不得标为 `error`。夸大依据的规则库会在加载期失败，而不会产出一份看起来很有底气的报告。

核验中确认的边界与"刻意没有作出的结论"见 [README.md](README.md#rule-sources)（英文主版本）与随包的 `rules/evidence/` 目录。

## Troubleshooting

- **插件装上了但工具不出现**：确认 `main` 指向 `lib/index.mjs` 且 `pnpm run build` 已生成该文件；`main` 写错会让加载器静默跳过该条目。
- **`dsh plugin add` 报版本不兼容**：peer 范围覆盖 `0.1.x` 与 `0.2.x`；若运行时在其之外，可显式豁免：`dsh plugin --profile <name> allow-version <包名@版本> --dsh-version <runtime> --accept-risk`
- **某条规则没有执行**：查看 `skipped` 数组，其中写明了规则 id 与原因。
- **`check` 报 `manifest-peers` 失败**：静态检查器比对的是一份早于 0.2 世代的硬编码 peer 范围；安装期的 peer 校验以运行时为准。这是 `dsh-plugin-dev` 的已知上游问题。
- **时间看起来偏移**：全部计算都是对输入字符串做墙上时钟运算，不做时区换算。

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-medrec-qc
```

第 4 项把 `../_shared` 的共享件同步进 `src/shared/`；每次改动共享件后都要重跑。

## License

[Apache License 2.0](LICENSE) © 2026 dsh-medrec-qc contributors.
