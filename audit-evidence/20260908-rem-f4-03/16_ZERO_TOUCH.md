# 16 — ZERO TOUCH (producción READ-ONLY absoluta)

## Regla

ENERVIDA-VITALLCONS y Puerto Padre VITALLCONS intocables: sin INSERT/UPDATE/
DELETE, sin RPC mutativa, sin recepción/venta/reversa/transferencia. Todas
las mutaciones de esta corrida ocurren en fixtures `AUDIT F4E1 STORE A/B`.

## Medición (script SELECT-only, mismas queries PRE y POST)

`evidence/remf403-zero-touch-PRE.txt` (antes de la migration)
`evidence/remf403-zero-touch-POST.txt` (tras migration + suite completa)

| Métrica | PRE | POST | ¿Igual? |
|---|---|---|---|
| ENERVIDA: product_count / stock / valor / zero-wac / max(updated_at) | 125 / 4012.5 / 1264283.99… / 67 / 2026-08-22 04:35:11.53 | idéntico | ✅ |
| PUERTO PADRE: product_count / stock / valor / zero-wac / max(updated_at) | 36 / 966.1289 / 7955629.678… / 0 / 2026-08-16 23:16:24.64 | idéntico | ✅ |
| ENERVIDA: movements / receipts / sales_tx / production_orders / withdrawals | 451 / 4 / 308 / 0 / 0 | idéntico | ✅ |
| PUERTO PADRE: movements / receipts / sales_tx / production_orders / withdrawals | 251 / 2 / 212 / 0 / 77 | idéntico | ✅ |
| Fingerprint estructural (funciones / triggers / md5 nombres) | 484 / 87 / `dd655ca6…` | idéntico | ✅ |
| Store identities (created_at) | idénticas | idénticas | ✅ |

**Única diferencia PRE↔POST en todo el fingerprint: Z5 — el ACL de la RPC
remediada** (`authenticated=X/postgres` añadido) que ES el cambio intencional
de la migration (no es mutación de datos de producción).

```text
diff PRE vs POST = 1 línea (Z5 acl) — todo lo demás byte-idéntico
```

## Conclusión

**ENERVIDA PRE == POST ✅ · PUERTO PADRE PRE == POST ✅**
(datos de producción byte-idénticos; único delta = GRANT objetivo de la remediación)

**ZERO-TOUCH = PASS.**
