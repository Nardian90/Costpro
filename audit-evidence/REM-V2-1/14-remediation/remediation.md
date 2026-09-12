# REM-V2-1 — 14 REMEDIACIÓN (propuesta; ejecutado solo lo repo-side seguro)

## Ejecutado en esta pasada (repo-side, sin comportamiento runtime)

| Paso | Acción | Evidencia |
|---|---|---|
| R-1 | `.env.example`: flags V2 documentadas con semántica exacta y estado objetivo `true` (cierra el GAP de FASE 0 §4) | `.env.example` sección "V2-ONLY (REM-V2-1)" |
| R-2 | `scripts/v2-only-contract-test.cjs` NUEVO — security contract FASE 14 estático (drop H5-B1, fallback neutralizado, allow-list de callers V1, gating de flags) | 15-regression PASS |
| R-3 | Evidence pack completo 00–18 + SHA256SUMS | este directorio |

## Propuesto — NO ejecutado (requiere autorización y/o credenciales live)

| Paso | Acción | Bloqueo |
|---|---|---|
| P-1 (§20.1) | Fijar `NEXT_PUBLIC_USE_V2_CHECKOUT=true` / `NEXT_PUBLIC_USE_V2_REVERSE=true` en el entorno de producción (`.env` del operador / plataforma) | el `.env` real vive fuera del repo; tras el reset del workspace no hay credenciales — acción del operador |
| P-2 (§20.2) | Migrar `SalesCatalogView` a `/api/pos/checkout` (guard de flag o reemplazo) — retira el último caller activo de `create_sale` | cambio de comportamiento de UI; requiere autorización humana + regresión E2E (§27: no refactor estético, este es funcional) |
| P-3 (§20.2) | Migrar `useInvertDocument` (recepción) a `/api/reverse` — elimina composite cliente no atómico | ídem |
| P-4 (§20.3) | Neutralizar `RPC_MAP_V1.receipt/.adjustment` → V2 (patrón H5-B1) y `create_devolution` flag-OFF path | ídem |
| P-5 (§20.4) | REVOKE live: PUBLIC ×3 (`create_sale_v2`, `reverse_receipt_v2`, `void_transaction` — F-06) + `receive_purchase` FROM authenticated (F-01) | requiere credenciales live + verificación zero-touch §22 |
| P-6 (§20.7-8) | DROP de `reverse_receipt`, `reverse_adjustment`, `create_devolution` tras observación con 0 referencias | solo después de P-1..P-5 + regresión |

## Nota de alcance (§27)

Ningún cambio estético o refactor general fue realizado. Los archivos tocados son exactamente:
`.env.example` (documentación de flags), `scripts/v2-only-contract-test.cjs` (nuevo, test),
`audit-evidence/REM-V2-1/**` (evidencia) y `worklog` fuera del repo.
