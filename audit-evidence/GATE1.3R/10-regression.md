# GATE 1.3R.1 — 10 REGRESSION (§29)

## Comandos

```text
npx tsc --noEmit  → 0 errores (exit 0)
npm test          → Test Files 102 passed | 1 skipped (103)
                    Tests 2143 passed | 24 skipped (2167) — 0 failed
npm run lint      → 0 errores, 1287 warnings (preexistentes de estilo, regla V2.12.25 <button> crudo)
```

## Delta vs PRE-GATE

| Métrica | PRE (f614ba75) | POST (esta fase) | Δ |
|---|---|---|---|
| tsc | 0 | 0 | = |
| vitest | 2143 passed / 0 failed | 2143 passed / 0 failed | **= (sin regresión)** |
| nav tests | 73/73 | 73/73 | = |
| lint errors | 0 | 0 | = |

## Browser real post-fix

- Login → OPERACIÓN → Vender → Ventas → Caja → Historial → Otras opciones → Palette → móvil →
  refresh → back → forward: todo funcional (`06/07/08-*.json`).
- Console errors de datos en sesión fresca sin tienda activa (`Se requiere storeId`, HTTP 400 en
  products): **preexistente**, ajeno a navegación/SW/Performance (ocurre igualmente en
  f614ba75; no forma parte del alcance de este gate).

## Roles (§30)

- `navigation-definition.ts` sin cambios → matriz de roles AUTH/RLS **UNCHANGED** (los 7 roles y
  `roles: [...]` intactos; verificados por gate1-navigation.test.ts: clerk ve pos+sales-hub,
  warehouse no, 73/73).
