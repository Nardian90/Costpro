# INFORME DE CIERRE — VERIFICACIONES Y CONTENCIÓN (2026-11-13)

Producción permanece en **modo exclusivamente lectura** durante toda esta etapa. Ninguna escritura fue ejecutada: conteos ANTES = DESPUÉS en las 13 tablas de referencia del dry-run, y las únicas operaciones de escritura (validación E2E del fix §17.1) se realizaron contra la **BD E2E aislada** (`lguovmvrozxgssupkwpf`), jamás producción.

## 1. F1 — Dry-run del backfill: cifras reconciliadas

**Discrepancia detectada y corregida.** El informe anterior sumaba mal en el Markdown: anunciaba 4.678 movimientos. Las cifras correctas, reconciliadas contra el JSON del script y consultas SQL independientes:

| # | Concepto | Cifra verificada |
|---|---|---:|
| 1 | Documentos originales elegibles | 1.342 |
| 2 | Asientos de reconocimiento | 1.342 |
| 3 | Asientos de pagos posteriores (servicios) | 16 |
| 4 | Movimientos de reconocimiento | 4.662 |
| 5 | Movimientos de pagos | 32 |
| 6 | **Totales generales** | **1.358 asientos / 4.694 movimientos** |

**7. Hash SHA-256 por pasada (pagos incluidos en ambas):** `32109d55dd3fb0db098f160b369add2c3a253e8f59fd2b762e092caac30945b4` (idéntico en PASADA 1 y PASADA 2; idempotencia demostrada). **Alcance exacto:** Por cada doc de RECONOCIMIENTO (orden: TIPO_SQL en orden de clave, filas en orden SQL): "tipo|id|total_cup|debitos:creditos". Por cada PAGO posterior (orden pt.id): "PAGO|pago_id|total_cup|debito:credito". La lista de elegibles y el importe total_cup de cada doc/pago son los datos que determinan el hash.

El informe se **regeneró desde los resultados comprobados** (script `fin-backfill-dryrun.mjs` v2: ahora los pagos posteriores se simulan dentro de las dos pasadas y entran en el hash; el MD lo genera `scripts/generar-informe-f1.py` desde el JSON, sin cifras manuales). La corrección 4.678→4.694 no fue un parche del Markdown.

### Reclasificación de numeración documental

- **Sin numeración (numeración ausente, NO duplicados): 811** — VENTA: COSTPRO (Prueba) 213, ENERVIDA 434, PUERTO PADRE 69; RECEPCIÓN: COSTPRO (Prueba) 3, ENERVIDA 87, PUERTO PADRE 5. (El informe anterior citaba 716 ventas y 95 recepciones globales; el desglose por tienda anterior mezclaba documentos postables y no postables.)
- **Duplicados reales (tienda+tipo+número, con numeración): 0.** Los tres pares VS-000002/000003/000004-2026 son de **tiendas distintas** (la numeración de vales es por tienda) — verificado fila a fila.
- **Duplicados de contabilización: 0** (`fin_entries = 0` hoy).

### Verificación cruzada triple (JSON ↔ Markdown ↔ PostgreSQL)

Consultas SQL independientes (script preservado `scripts/reconciliar-f1-cifras.py`) confirmaron: elegibles por tipo fila a fila (VENTA 989, RECEPCIÓN 96, SERVICIO 16, VALE 235, AJUSTE 1, COMISIÓN 1, DEVOLUCIÓN 2, FLUJO 2, NÓMINA 0); pagos posteriores 16 por 33.215,00 CUP con 0 pagos en moneda distinta al documento; exclusiones 104 (38 VENTA + 2 RECEPCIÓN + 50 SERVICIO + 12 VALE + 2 NÓMINA en estado no postable). Nota: el literal de estado de FLUJO_CAJA es `'confirmado'` (español) — verificado correcto.

**Estado de autorización: el backfill NO está autorizado.** Dry-run listo para decisión.

## 2. Tiendas: inclusión/exclusión del backfill y apertura

| Tienda | store_id | Naturaleza verificada | Decisión |
|---|---|---|---|
| ENERVIDA-VITALLCONS | `5e6fe821-5465-48b1-b3f1-3aa3182edc38` | Operativa real (707 ventas, 88 recepciones, 14 servicios, 232 vales) | **INCLUIDA** — alcance inicial recomendado |
| PUERTO PADRE | `899d2503-d000-41d2-89f0-0827f4ac37ab` | Operativa real (69 ventas, 5 recepciones, 2 servicios, 1 vale; creada 2026-11-02) | **INCLUIDA** — fase posterior, autorización independiente |
| COSTPRO (Prueba) | `43a4dabc-b8b4-4b66-82b3-0c75335ca5d1` | Pruebas (nombre literal, 218 docs de prueba 2026-05→11) | **EXCLUIDA** — contaminaría estados financieros |
| QA UI Icons Store | `6691b866-a7cd-409b-b1e5-dd9bc2ad9d7a` | Pruebas (creada 2026-11-07 para QA de release) | **EXCLUIDA** |
| QA-Release-1593-Plantillas | `30c3a373-2012-4728-8f51-d8d8ad73eb17` | Pruebas (creada 2026-11-10, inactiva) | **EXCLUIDA** |
| FERROCARRIL VITALLCONS | `8eb56fa3-…` | Operativa sin documentos (0 postables) | Fuera de alcance hasta que registre operaciones |
| SHADDAI | `bc94e3d0-…` | Operativa sin documentos (0 postables) | Fuera de alcance hasta que registre operaciones |

Efecto del filtro en las cifras del dry-run (sobre los elegibles actuales): ENERVIDA 1.047 docs + PUERTO PADRE 77 docs quedarían dentro; los 218 docs de COSTPRO (Prueba) quedarían fuera. El backfill real tomará el filtro por tienda como parámetro de alcance, con autorización independiente por tienda.

## 3. F2 — Saldos iniciales: matriz preparada, sin registro

- **Fechas de corte exactas:** ENERVIDA **2026-06-30** (primer doc: recepción 2026-07-01); PUERTO PADRE **2026-10-09** (primer doc: recepción 2026-10-10). Sin solapamiento con el backfill por construcción.
- **Inventario inicial verificado (no supuesto):** kardex completo reproduce `stock_current` en 166/166 productos de ENERVIDA y 56/56 de PUERTO PADRE, sin movimientos previos al corte → inventario inicial 0 unidades por reconstrucción. ⚠️ PUERTO PADRE: `cost_average` uniforme de 1,00 requiere verificación documental.
- **Plantilla sin importes y sin filas draft** → `download/matriz-saldos-iniciales-f2.md` (categorías PCG por tienda, fuentes documentales y datos pendientes: arqueos de caja, extractos bancarios, CxC/CxP, activos fijos, capital declarado).
- **PAT_CAPITAL no será cuenta de ajuste:** las diferencias se explican por partida o la partida no se registra.

## 4. §17.1 — Servicios Recibidos en divisa: PR #1612 con CI VERDE

**Los 4 checks fallidos del PR #1612 fueron reparados y CI está 9/9 en verde** (commit `8d96fb6ac`, rama `fix/servicios-usd-17-1-20261113`):

| Check | Causa del fallo | Corrección |
|---|---|---|
| Security Audit | `BODY_DRIFT`: `contract-surface.sql` desactualizado (no traía la nueva definición de `register_supplier_payment`) | Surface actualizado quirúrgicamente con `pg_get_functiondef` verbatim de la BD E2E (donde la migración ya está aplicada) |
| TypeCheck+Lint+Unit+Build (y Unit & Integration) | `scripts/validar-fix-17-1-servicios-usd.mjs` era un escritor nuevo sin declarar → rompía `check-writers` y el smoke del destructive-guard | Guard canónico `assertNotProduction` cableado (mode=write, projectRef=BD E2E) + entrada en `guardProtected` de `writers.manifest.json` |
| E2E Aislado | Bloqueado en el arranque por DERIVA del manifiesto de replay (la migración nueva 20261113120800 no estaba en el manifiesto commiteado) | Manifiesto regenerado (155 incluidas) + test 154→155 |

No-regresión verificada: validación E2E del fix en BD aislada **14/14 PASS** (P1–P10 + F0a/F0b + limpieza net-delta-0), 89+7 tests de guards locales, `check-writers` OK, destructive-guard OK, replay `--check` MATCH, Security Audit 0 divergencias. **El cambio sigue independiente de CP-FIN.** Sin migración en producción, sin recálculos, sin alterar pagos reales: listo para revisión/aprobación, sin autorización de despliegue asumida.

## 5. Seguridad — archivo costpro-env.txt: contenido y auditado

1. **Eliminado** de todos los puntos de entrega: `download/costpro-env.txt`, `.env.txt` y el PAT temporal `/tmp/pat.txt` (verificado con `ls`).
2. **Alcance de la exposición auditado:**
   - **Git: nunca llegó.** Escaneo de todas las ramas y commits (`git log --all --diff-filter=A` + `git grep` en rev-list): 0 hits de `costpro-env`/`.env` real; solo `.env.example` con placeholders (0 credenciales).
   - **CI: no sube el workspace.** Los artifacts solo empaquetan `coverage/`, `test-results/` y `playwright-report/` (paths verificados en los workflows).
   - **PRs: 0 secretos** en los diffs de ambas ramas nuevas (patrón de detección de tokens).
   - **Alcance real:** el archivo vivió únicamente en el canal del chat y en el sandbox privado (`download/`), ya eliminados.
3. **Credenciales vigentes:** el GitHub PAT de trabajo sigue **activo** (verificado vía API sin imprimirlo; permisos admin sobre el repo). Recomendación firme: **rotarlo**, ya que circuló por un canal ajeno al entorno privado de configuración. La verificación de vigencia del resto de secretos (Supabase) quedó fuera del alcance de esta etapa por indicación del propietario; su rotación debe seguir el mismo procedimiento cuando se decida.
4. **Compromiso:** no se volverán a generar copias de `.env` ni artefactos con credenciales; ningún informe/worklog incorporará su contenido.

## 6. Condiciones respetadas

| Operación | Estado |
|---|---|
| Backfill real (total o parcial) | **No ejecutado** — dry-run listo |
| Saldos iniciales (crear/aplicar) | **No ejecutado** — matriz preparada |
| Migración PR #1612 en producción | **No aplicada** — CI verde, PR abierto |
| Recalculos/actualización de históricos §17.1 | **No ejecutados** |
| Limpieza/modificación de documentos reales | **No ejecutada** |
| Escrituras en producción | **0** (conteos idénticos ANTES/DESPUÉS) |

Archivos de evidencia: `download/fin-backfill-dryrun-informe.md` (+`.json`), `download/matriz-saldos-iniciales-f2.md`, `download/informe-17-1-servicios-usd.md`. Scripts preservados en `scripts/` (reconciliar-f1-cifras.py, generar-informe-f1.py, generar-f2-matriz.py) y en el repo (rama feat: fin-backfill-dryrun.mjs v2).
