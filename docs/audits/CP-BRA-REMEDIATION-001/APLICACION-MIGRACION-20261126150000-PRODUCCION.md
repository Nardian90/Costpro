# APLICACIÓN EN PRODUCCIÓN — 20261126150000 (CP-BRA-REMEDIATION-001: R-11)

**Fecha:** 2026-11-25 (~19:35 UTC) · **Misión:** CP-BRA-REMEDIATION-001 · **PR:** fix/cpbra-r11-pos-incidencias
**Canal:** Management API `/database/query` + `NOTIFY pgrst, 'reload schema'` (201), guard CP-INFRA-019 con
doble flag del operador, lote único, sin reintentos.
**Producción:** CostproBD — ref `wthkddeleylijmonclxg`.
**Script versionado:** `scripts/cpbra-apply-migration-prod.mjs` (writers.manifest guardProtected; 5 marcas
re-ejecutables + modo `--check`).

---

## 1. Qué remedia

**R-11 (CRÍTICO, POS-006):** un payload con `payment_incidents[]` no vacío desactivaba el invariante PT011
(Σ amount_cup = total) sin ninguna verificación server-side de causa/monto. Evidencia producción
(forense 2026-11-25): **3 ventas `completed` con Σpagos ≠ total** (difs −200, −12 000, +8 100) — el ledger
subestimaba el cobro.

Corrección (capa autoritativa — reemisión VERBATIM de `create_sale_v2` de 20261125120000 salvo DOS bloques):
- **§11.6 Estructura:** cada incidencia debe ser objeto con `type` del enum canónico
  (`insufficient_payment|overpayment|mixed_breakdown_mismatch|rate_difference`), `expected_cup`/`received_cup`
  numéricos ≥ 0 y `difference_cup` = received − expected (±0.01) → `ERR_INCIDENT_INVALID_STRUCTURE` /
  `ERR_INCIDENT_ARITHMETIC_MISMATCH`.
- **§18 Cobertura:** si Σpagos ≠ total, alguna incidencia debe DECLARAR exactamente esa diferencia
  (|difference_cup − (Σpagos − total)| ≤ 0.01) → `ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE`. La puerta
  MISIÓN-FLEX sigue abierta (decisión del propietario 2026-10-17), pero ya NO es evadible con un array arbitrario.

## 2. Orden §11g cumplido (aislado antes que producción)

1. **BD aislada CostproE2E primero:** aplicada, 5/5 marcas.
2. **E2E de humo contra la aislada (swap de entorno completo, suite del workflow CI):**
   - **55/57 PASS** — incluye TODA la batería POS sobre el RPC real con la validación activa:
     E2E-POS-001..008 (ventas P0, idempotencia, stock, descuadre 422, auth, membership) y
     E2E-POS-010..015b (distribución por línea). **E2E-POS-015b (I2) «importe parcial CON incidencias
     documentadas: se registra» PASS** — compatibilidad de la puerta MISIÓN-FLEX probada end-to-end.
   - 2 fallos SOLO en flujos UI (E2E-POS-009/E2E-INV-008): limitación ambiental del sandbox local de 4GB
     en dev-mode documentada en `playwright.config.ts` (el CI usa `next start` con build de producción,
     donde estos specs pasan — p. ej. 21/21 en el PR #1708). POS-009 falla en el arranque del shell de
     página, ANTES de cualquier venta; el HTML servidor SÍ renderiza (verificado por curl).
   - **Guardrail net-zero PASS** (los dos runs): cero residuos en la BD aislada.
3. **Producción, UNA sola vez:** 5/5 marcas, NOTIFY pgrst reload schema.
4. **Surface re-certificado:** 232 funciones, sha256 `cb6bf4f8…` · `security-contract-test-static.cjs` ⇒
   **CONTRATO OK, 0 divergencias** (3 warnings MEDIUM/LOW preexistentes).

## 3. Estado ANTES → DESPUÉS (producción, marcas re-ejecutables)

| Marca | Antes | Después |
|---|---|---|
| `create_sale_v2` contiene `ERR_INCIDENT_INVALID_STRUCTURE` | false | **true** |
| `…ERR_INCIDENT_ARITHMETIC_MISMATCH` | false | **true** |
| `…ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE` | false | **true** |
| firma única de 35 args | true | **true** (intacta) |
| `…ERR_PAYMENT_INVARIANT_VIOLATED` (PT011 sin incidencias) | true | **true** (intacto) |

Re-ejecutable: `node scripts/cpbra-apply-migration-prod.mjs --check` (debe dar 14/14 OK y exit 0).

## 4. Compatibilidad (pruebas)

- Las **3 ventas históricas** con incidencias cumplen el contrato (sus `difference_cup` coinciden con el
  descuadre real: +200, +12 000, −8 100) → sin impacto retroactivo.
- El payload del checkout (`src/lib/pos/payment-incidents.ts`) emite exactamente los campos exigidos
  (verificado por el test de contrato + E2E POS-015b).

## 5. Decisiones pendientes del propietario (documentadas, NO impuestas)

- **Tope máximo** de diferencia admisible por incidencia (p. ej. X CUP o % del total).
- **Autorización de supervisor** para diferencias por encima de un umbral (patrón D1–D5 de descuentos ≥15%).
- Exigir `detail` (motivo) obligatorio en la UI para el cajero.

Estas son decisiones de política de negocio; este PR cierra la evasión estructural (lo verificable
técnicamente) sin fijar política unilateralmente.
