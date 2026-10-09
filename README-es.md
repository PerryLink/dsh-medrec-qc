# dsh-medrec-qc — Comprobación de forma y avisos de contradicción lógica de la portada del historial clínico de hospitalización

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)

`dsh-medrec-qc` lee una exportación de la portada del historial clínico de hospitalización (病案首页), una fila por alta, con el juego de columnas de la exportación de evaluación nacional, de la estadística sanitaria o de una exportación local del hospital, y comprueba la completitud formal, la aritmética interna y la forma de codificación de esa misma exportación: que cada columna obligatoria tenga contenido o el marcador `-`, que las horas de ingreso y de alta estén presentes, sean precisas al minuto y no estén invertidas, que la estancia declarada coincida con las dos fechas, que el nombre y el código del diagnóstico principal y los de la operación principal se rellenen juntos, que los códigos tengan la forma escrita que configura el paquete de reglas, que las tres columnas de firma reflejen la responsabilidad médica de tres niveles, que el modo de alta sea uno de los códigos definidos, que la edad y los pesos neonatales usen las formas prescritas, que el número de otros diagnósticos no supere el techo configurado, y que se señalen para revisión humana un diagnóstico incompatible con el sexo registrado o dos horas discordantes en un alta por fallecimiento.

## Cómo se ve la salida

![Terminal demo of dsh-medrec-qc: real output over its MR-009 fixture](https://raw.githubusercontent.com/PerryLink/dsh-medrec-qc/main/docs/assets/dsh-medrec-qc-demo.png)

Salida real de este plugin sobre su propio fixture de prueba `MR-009` — no es un montaje. El paquete de reglas no inventa citas, así que cada hallazgo nombra la cláusula aplicada y advierte que su texto no se obtuvo.

## Qué responde

| Usted pregunta | Qué responde |
|---|---|
| Una columna obligatoria está vacía, pero escribí `-` en ella. ¿Se informa de eso? | No. `MR-001` considera un `-` aislado la marca de «no hay nada que registrar» e informa solo de las columnas realmente vacías. Comprueba que la columna obligatoria tenga contenido, no que el contenido sea correcto, y su gravedad queda limitada a `warn` porque el anexo que cita es un PDF que este entorno no puede descodificar. Ese mismo `-` sigue contando como firma ausente en `MR-009`. |
| La hora de ingreso figura como una fecha sin hora ni minuto, y en una fila la hora de alta es anterior a la de ingreso. | `MR-002` informa de un `入院时间` o `出院时间` que solo se puede leer hasta el día, porque el tiempo registrado debe ser preciso al minuto, y también informa de un valor que no puede analizar como fecha y hora. `MR-003` compara el orden literal de los dos campos e informa de la fila en la que la hora de alta va primero. Ambas trabajan sobre los valores literales y ninguna decide cuál de las dos horas es la verdadera. |
| La portada dice `5` días, pero las fechas son ingreso el 12 de junio y alta el 15 de junio. | `MR-004` recalcula los días como fecha de alta menos fecha de ingreso e informa de la fila cuando el `实际住院天数` declarado no coincide; el ingreso y el alta el mismo día cuentan como `0` días, y un valor que no sea un número entero de días también se informa. Solo compara esos tres valores guardados y no decide cuál de ellos está mal. |
| `主要诊断名称` está relleno y `主要诊断编码` vacío, y otra fila trae un código de forma extraña. | `MR-005` exige que ambos se rellenen juntos y nombra el que falta; comprueba únicamente que los dos existan, no que el código corresponda al diagnóstico. `MR-006` contrasta después el código con la forma escrita configurada en el paquete y no verifica que ese código exista en ninguna versión del directorio de clasificación. |
| Un lote no trae ningún registro de operación. ¿Las reglas de operación pasan en silencio? | No. `MR-007` se declara en `skipped` con el motivo de que el material no contiene registros de operación y la comprobación de pareja no procede, en lugar de pasar en silencio. Cuando una fila sí registra una operación, la regla exige que `主要手术名称` y `主要手术编码` se rellenen juntos, y `MR-008` comprueba solo la forma escrita del código de operación. |
| El diagnóstico principal de un paciente varón es una afección relacionada con el embarazo. ¿Bloquea la exportación? | `MR-014` lo informa como una diferencia de nivel `warn` para que la confirme una persona, nunca como un bloqueo: los documentos sanitarios no contienen ninguna cláusula que haga incompatible un diagnóstico con el sexo registrado, y el detalle publicado de ese tipo de regla del seguro médico no cubre el capítulo de embarazo, parto y puerperio y admite excepciones de justificación clínica. Confirme con el clínico si el error está en el sexo o en el diagnóstico. |

## Normas que sigue

| Documento | Número | Reglas que lo citan |
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

| Superficie | Estado |
|---|---|
| Harness | Rango de peers `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` — verificado para aceptar tanto `0.2.0-rc.2` como `0.2.1-alpha.1`. **No se declara `engines.dsh`**: no tiene lector y no puede rechazar ningún host |
| Node | `^22.19.0 || >=24.0.0` |
| Plataformas | Todas (ESM puro; sin código nativo, sin red, sin llamada al modelo) |
| Modo de herramienta | Funciona en `native`, `ptc` y `both`; para un directorio completo use `ptc` |

## What it does

La tabla de reglas, los campos y el comportamiento detallado están en [README.md](README.md#what-it-does) (versión principal en inglés). El plugin sólo enumera divergencias literales frente a las cláusulas citadas e indica en `skipped` cada comprobación que no pudo ejecutarse.

## Install

```sh
dsh plugin --profile <name> add dsh-medrec-qc
dsh --profile <name> --dump-config | grep 'dsh-medrec-qc'
```

## Configuration

Todos los parámetros ajustables viven en el esquema Schemastery de `src/config.ts`, por lo que se cambian desde `cordis.yml` sin tocar el código; los umbrales por regla están en el paquete de reglas bajo `rules/`.

| Clave | Tipo | Predeterminado | Descripción |
|---|---|---|---|
| `rulesFile` | string | `rules/medrec-qc.yaml` | Ruta del paquete de reglas, relativa a la raíz del paquete |
| `disabledRules` | string[] | `[]` | Ids de reglas que se dejan de ejecutar; cada una aparece en `skipped` |
| `onlyRules` | string[] | `[]` | Ejecutar solo estas reglas; vacío ejecuta todas |
| `skipNotes` | string | `""` | Nota añadida a cada motivo de `skipped` |
| `timeoutMs` | number | `120000` | Presupuesto de tiempo de espera cooperativo de la herramienta |

## Material format

Acepta JSON o YAML. El ejemplo completo de campos está en [README.md](README.md#material-format) (versión principal en inglés). Los campos son opcionales en la capa de lectura y los valida el motor, de modo que una exportación parcial produce hallazgos sobre lo que falta en lugar de un fallo.

## Rule sources

Los datos de las reglas están separados del código: cada regla lleva documento, número, cláusula en la numeración propia de la fuente, extracto literal y URL de origen. El cargador impone que el extracto sea una cita real de al menos ocho caracteres y que una comprobación basada sólo en un principio general (`kind: derived-from-principle`, tope `warn`) o en una política local (`kind: institutional-configuration`, tope `info`) nunca se declare `error`.

Los límites verificados y las conclusiones deliberadamente **no** afirmadas están en [README.md](README.md#rule-sources) (versión principal en inglés) y en `rules/evidence/`.

## Troubleshooting

- **El plugin se instala pero la herramienta no aparece**: compruebe que `main` resuelve a `lib/index.mjs` y que `pnpm run build` lo generó.
- **`dsh plugin add` rechaza el paquete**: la faixa de peers cubre `0.1.x` y `0.2.x`; fuera de ella, conceda una exención explícita con `dsh plugin --profile <name> allow-version <pkg@ver> --dsh-version <runtime> --accept-risk`.
- **Una regla no se ejecutó**: lea el arreglo `skipped`.
- **`check` informa `manifest-peers` como fallo**: es un problema conocido de `dsh-plugin-dev`; el runtime aplica la compatibilidad al instalar.
- **Los horarios parecen desplazados**: toda la aritmética es de hora local sobre las cadenas entregadas.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-medrec-qc
```

El último comando copia el kit compartido de `../_shared` a `src/shared/`; vuelva a ejecutarlo tras cada cambio compartido.

## License

[Apache License 2.0](LICENSE) © 2026 dsh-medrec-qc contributors.
