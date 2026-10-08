# dsh-medrec-qc — Verificação de forma e avisos de contradição lógica da folha de rosto do registo clínico de internamento

`dsh-medrec-qc` lê uma exportação da folha de rosto do registo clínico de internamento (病案首页), uma linha por alta, com o conjunto de colunas da exportação de avaliação nacional, da estatística sanitária ou de uma exportação local do hospital, e verifica a completude formal, a aritmética interna e a forma de codificação dessa mesma exportação: que cada coluna obrigatória tenha conteúdo ou o marcador `-`, que as horas de admissão e de alta estejam preenchidas, sejam precisas ao minuto e não estejam invertidas, que o tempo de internamento declarado coincida com as duas datas, que o nome e o código do diagnóstico principal e os da operação principal sejam preenchidos em conjunto, que os códigos tenham a forma escrita que o pacote de regras configura, que as três colunas de assinatura reflitam a responsabilidade médica de três níveis, que o modo de alta seja um dos códigos definidos, que a idade e os pesos neonatais usem as formas prescritas, que o número de outros diagnósticos não exceda o limite configurado, e que sejam assinalados para revisão humana um diagnóstico incompatível com o sexo registado ou duas horas discordantes numa alta por óbito.

## O que ele responde

| Você pergunta | O que ele responde |
|---|---|
| Uma coluna obrigatória ficou vazia, mas escrevi `-` nela. Isso é reportado? | Não. `MR-001` considera um `-` isolado a marca de «não há nada a registar» e reporta apenas as colunas realmente vazias. Verifica que a coluna obrigatória tem conteúdo, não que o conteúdo está correto, e a sua gravidade fica limitada a `warn` porque o anexo que cita é um PDF que este ambiente não consegue descodificar. Esse mesmo `-` continua a contar como assinatura em falta em `MR-009`. |
| A hora de admissão está escrita só com a data, sem hora nem minuto, e numa linha a hora de alta é anterior à da admissão. | `MR-002` reporta um `入院时间` ou `出院时间` que só pode ser lido até ao dia, porque o tempo registado deve ser preciso ao minuto, e reporta também um valor que não consegue analisar como data e hora. `MR-003` compara a ordem literal dos dois campos e reporta a linha em que a hora de alta vem primeiro. Ambas trabalham sobre os valores literais e nenhuma decide qual das duas horas é a verdadeira. |
| A folha de rosto diz `5` dias, mas as datas são admissão a 12 de junho e alta a 15 de junho. | `MR-004` recalcula os dias como data de alta menos data de admissão e reporta a linha quando o `实际住院天数` declarado não coincide; admissão e alta no mesmo dia contam `0` dias, e um valor que não seja um número inteiro de dias também é reportado. Compara apenas esses três valores guardados e não decide qual deles está errado. |
| `主要诊断名称` está preenchido mas `主要诊断编码` está vazio, e noutra linha o código tem uma forma estranha. | `MR-005` exige que ambos sejam preenchidos em conjunto e indica qual falta; verifica apenas que os dois existam, não que o código corresponda ao diagnóstico. `MR-006` testa depois o código contra a forma escrita configurada no pacote e não verifica se esse código existe em qualquer versão do diretório de classificação. |
| Um lote não traz qualquer registo de operação. As regras de operação passam em silêncio? | Não. `MR-007` declara-se em `skipped` com o motivo de que o material não contém registos de operação e a verificação de par não se aplica, em vez de passar em silêncio. Quando uma linha regista mesmo uma operação, a regra exige que `主要手术名称` e `主要手术编码` sejam preenchidos em conjunto, e `MR-008` verifica apenas a forma escrita do código de operação. |
| O diagnóstico principal de um doente do sexo masculino é uma condição relacionada com a gravidez. Isso bloqueia a exportação? | `MR-014` reporta-o como uma diferença de nível `warn` para confirmação humana, nunca como bloqueio: os documentos sanitários não contêm qualquer cláusula que torne um diagnóstico incompatível com o sexo registado, e o detalhe publicado desse tipo de regra do seguro de saúde não abrange o capítulo de gravidez, parto e puerpério e admite exceções de justificação clínica. Confirme com o clínico se o erro está no sexo ou no diagnóstico. |

## Normas que segue

| Documento | Número | Regras que o citam |
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

| Superfície | Estado |
|---|---|
| Harness | Faixa de peers `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` — verificada para aceitar tanto `0.2.0-rc.2` quanto `0.2.1-alpha.1`. **`engines.dsh` não é declarado**: não tem leitor e não pode recusar nenhum host |
| Node | `^22.19.0 || >=24.0.0` |
| Plataformas | Todas (ESM puro; sem código nativo, sem rede, sem chamada ao modelo) |
| Modo de ferramenta | Funciona em `native`, `ptc` e `both`; para um diretório inteiro use `ptc` |

## What it does

A tabela de regras, os campos e o comportamento detalhado estão em [README.md](README.md#what-it-does) (versão principal em inglês). O plugin apenas lista divergências literais frente às cláusulas citadas e indica em `skipped` cada verificação que não pôde ser executada.

## Install

```sh
dsh plugin --profile <name> add dsh-medrec-qc
dsh --profile <name> --dump-config | grep 'dsh-medrec-qc'
```

## Configuration

Todos os parâmetros ajustáveis ficam no esquema Schemastery de `src/config.ts`, portanto mudam pelo `cordis.yml` sem editar código; os limites por regra ficam no pacote de regras sob `rules/`.

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `rulesFile` | string | `rules/medrec-qc.yaml` | Caminho do pacote de regras, relativo à raiz do pacote |
| `disabledRules` | string[] | `[]` | Ids de regras a desativar; cada uma aparece em `skipped` |
| `onlyRules` | string[] | `[]` | Executar apenas estas regras; vazio executa todas |
| `skipNotes` | string | `""` | Nota acrescentada a cada motivo de `skipped` |
| `timeoutMs` | number | `120000` | Orçamento de tempo limite cooperativo da ferramenta |

## Material format

Aceita JSON ou YAML. O exemplo completo de campos está em [README.md](README.md#material-format) (versão principal em inglês). Os campos são opcionais na camada de leitura e validados pelo motor, de modo que uma exportação parcial gera achados sobre o que falta em vez de falhar.

## Rule sources

Os dados das regras ficam separados do código: cada regra traz documento, número, cláusula na numeração própria da fonte, trecho literal e URL de origem. O carregador impõe que o trecho seja citação real de pelo menos oito caracteres e que uma verificação baseada apenas em princípio geral (`kind: derived-from-principle`, teto `warn`) ou em política local (`kind: institutional-configuration`, teto `info`) nunca seja declarada `error`.

Os limites verificados e as conclusões deliberadamente **não** afirmadas estão em [README.md](README.md#rule-sources) (versão principal em inglês) e em `rules/evidence/`.

## Troubleshooting

- **O plugin instala mas a ferramenta não aparece**: confirme que `main` resolve para `lib/index.mjs` e que `pnpm run build` o gerou.
- **`dsh plugin add` recusa o pacote**: a faixa de peers cobre `0.1.x` e `0.2.x`; fora dela, conceda isenção explícita com `dsh plugin --profile <name> allow-version <pkg@ver> --dsh-version <runtime> --accept-risk`.
- **Uma regra não executou**: leia o arranjo `skipped`.
- **`check` informa `manifest-peers` como falha**: problema conhecido do `dsh-plugin-dev`; o runtime aplica a compatibilidade na instalação.
- **Os horários parecem deslocados**: toda a aritmética é de hora local sobre as cadeias fornecidas.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-medrec-qc
```

O último comando copia o kit compartilhado de `../_shared` para `src/shared/`; execute-o novamente após cada alteração compartilhada.

## License

[Apache License 2.0](LICENSE) © 2026 dsh-medrec-qc contributors.
