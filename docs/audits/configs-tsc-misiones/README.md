# Configs TypeScript de misiones (histórico)

Configuraciones `tsconfig` de alcance acotado que cada misión de desarrollo usó
para validar por tipo solo los archivos que tocaba (`bunx tsc -p <config>
--noEmit`). Se movieron desde la raíz del repositorio el 2026-11-06 (misión de
saneamiento estructural): son artefactos de diagnóstico de un solo uso, ya
cumplido, y se conservan para reproducibilidad de los expedientes de
`docs/audits/`.

| Config | Misión / expediente asociado |
|---|---|
| `tsconfig.mision-1510.json` | `docs/audits/FIX_REPORTE_ENTREGA_COMISIONES_1510_2026-10-16.md` |
| `tsconfig.mision-1610.json` | `docs/audits/INCIDENTE_REPORTE_ENTREGA_ENERVIDA_MONEDAS_SKU108_2026-10-16.md` |
| `tsconfig.mision-1710.json` | `docs/audits/MISION_VENTAS_VALIDACION_PAGOS_CONFIRMACION_TASAS_2026-10-16.md` |
| `tsconfig.mision-1810.json` | `docs/audits/MISION_POLITICA_TEMPORAL_INFORME_FINAL_2026-10-18.md` |
| `tsconfig.mision-express-parity.json` | `docs/audits/agent-ctx/informe-final-mision-vender-express-20261030.md` |
| `tsconfig.mision-catalogo-pr1.json` | `docs/audits/CP_CATALOGO_MAESTRO_PR1_BLOQUEOS_SEGURIDAD_2026-10-28.md` |
| `tsconfig.cp-cat-maestro-002.json` | `docs/audits/CP-CAT-MAESTRO-002_VITALLCONS_ENERVIDA_FERRO.md` |
| `tsconfig.e2e.json` | `docs/audits/CP_E2E_READINESS_001_COSTPROE2E.md` |
| `tsconfig.mision-caja-v224.json` | Misión caja v2.24 (ver `docs/audits/`) |
| `tsconfig.mision-correcciones-ventas-001.json` | Correcciones de ventas 001 |
| `tsconfig.mision-efectivo-fisico.json` | Misión efectivo físico |
| `tsconfig.mision-fechas-trabajo.json` | Misión fechas de trabajo |
| `tsconfig.mision-ipv-filtros.json` | Misión filtros IPV |
| `tsconfig.mision-pi-superadmin.json` | Misión PI superadmin |
| `tsconfig.mision-pos.json` | Misión POS |
| `tsconfig.mision-recepciones-productos.json` | Misión recepciones de productos |
| `tsconfig.mision-res11-sc204.json` | Misión RES-11 / SC-2-04 |

Nota: los `include` de estos configs usaban rutas relativas a la raíz del repo;
para reutilizarlos, ejecútalos desde la raíz (`bunx tsc -p
docs/audits/configs-tsc-misiones/<config>.json --noEmit`). El typecheck global
del proyecto sigue siendo `bunx tsc --noEmit` con el `tsconfig.json` raíz.
