# W7-19 — EVIDENCE PROVENANCE · Cadena de custodia P-1 (W6.2) + nuevos artefactos W7-D1

Fecha: 2026-08-30 · Regla aplicada: NO se borró ni sustituyó silenciosamente evidencia; ambas generaciones quedan registradas.

## 1. Desviación P-1 — 4 archivos W6.2 sobrescritos

**Hecho**: durante la FASE 17 (re-run en clon limpio) de la sesión W7 previa (2026-08-30, ~03:53), los outputs `W62-11/12/17/21` de `w62-remediation/` fueron sobrescritos por los outputs frescos de las MISMAS suites. El `SHA256SUMS` histórico de W6.2 quedó 10/14. Los SHA históricos originales ya NO corresponden a los archivos actuales.

**Por qué se produjo**: el runner de la FASE 17 escribió sus salidas directamente sobre las rutas de evidencia W6.2 (violación de «no modificar el paquete original W6.2»). **Fase que lo produjo**: W7 FASE 17. **Motivo**: re-ejecución de regresión; los artefactos regenerados son reemplazos de ejecución, no revisiones de contenido.

### Cadena de custodia (histórico → actual)

| Archivo | SHA ORIGINAL-HISTORICAL (SHA256SUMS W6.2) | SHA RERUN-REPLACEMENT (actual, verificado 2026-08-30) |
|---|---|---|
| W62-11-DF01-WAC.out | `57efe53bc56d1dd260e55091cf2a855f79b1702600c436216fcf6d3e32e5c4d9` | `87bbc9eee6445131b01330411b12345e2b63e7e8e562c6ac4f0475f5135127af` |
| W62-12-DF02-COGS.out | `f70100c8af1317e2a34ef321e1a2215310dabd81f6152d1c517079c231f16138` | `435561619a1526b714a905c2535adcfcb9a829a78d03ce80d28daf0d2ecebf66` |
| W62-17-DF07-DEVOLUTION-RACE.out | `c8b530531fe775f00b40d2afe4876dc2c1e560ced9a82fd82240d20a63a0124e` | `ceea3843868c83d78a63d8535f0c65bc16482d5bd9029fb1d9cd69e96319f516` |
| W62-21-ADVERSARIAL.out | `f599661b456b835b5f7ba7cff896894bbf2c7982025761d2aaa36f41c3939037` | `7a37b9a0e013f75357a340479ea45704929068b9105b227b9608150852c29e76` |

Los 10 archivos restantes conservan su SHA histórico verificado (10/14 OK en `sha256sum -c`).

### Clasificación y equivalencia funcional

| Cuestión | Declaración objetiva |
|---|---|
| ¿Qué asserts contienen los reemplazos? | Los mismos casos de las mismas suites (case-df01-before/after, case-df02, case-df07-race, case-adversarial de `scripts/w62-lab/cases/` — código de caso SIN cambios entre generaciones) |
| ¿Es funcionalmente equivalente? | **Sí por diseño del experimento** (mismos SQL de casos, mismo protocolo, mismos clones-plantilla); los totales esperados por suite coinciden con los históricos (30/20/…/15 ataques). Los PASS de cada suite están además RE-DEMOSTRADOS de forma independiente por esta sesión (W7-17: 170 asserts en clon fresco con parche) |
| ¿Reemplaza o complementa? | Los actuales son **RERUN-REPLACEMENT** (evidencia de re-ejecución); el valor probatorio histórico de la ORIGINAL-HISTORICAL queda preservado en los SHA registrados arriba y en el worklog — no sustituyen la declaración histórica, la complementan |
| ¿Se declara «SHA OK»? | **NO para los 4 archivos**: se declara `historical artifact preserved/known (por SHA registrado) + current artifact hash verified + provenance documented` |

**Pendiente de decisión del dueño**: (a) aceptar el RERUN-REPLACEMENT como evidencia vigente, o (b) tratar la cadena W6.2 como rota y re-generar la evidencia completa en un clon limpio bajo custodia estricta (los casos son reproducibles; ~30 min de laboratorio).

## 2. Artefactos nuevos de esta sesión (custodia desde el origen)

| Artefacto | Papel |
|---|---|
| `w7d1-acl-patch.sql` | parche ACL (3 REVOKE) — candidato a enmienda del paquete 01 |
| `w7d1-rollback-complement.sql` | DROP del huérfano `w62_guard_wac_writer()` — candidato a añadido del runbook de rollback |
| `tmp/w7d1-f1-forensic.out` / `tmp/w7d1-f3-post-patch.out` | forense pre/post |
| `tmp/w7d1-f2-exploit.out` | exploit pre-parche (6/6) |
| `tmp/w7d1-f5-acltests.out` / `tmp/w7d1-f6-nobypass.out` | ACL 12/12 · no-bypass |
| `tmp/w7d1-reg-*.out` | regresión completa con parche (170 asserts) |
| `tmp/w7d1-rb-baseline.txt` / `tmp/w7d1-rb-post2.txt` | rollback: POST == BASELINE (SHA idéntico `7d9c984d…`) |

SHAs completos en `W7-21-SHA256SUMS`. Los clones (`w7d1_pre`, `w7d1_gate`, `w7d1_reg`, `w7d1_rb`, `w7d1_rb2`, `w7d1_rb3`) fueron destruidos al cierre (FASE 14).
