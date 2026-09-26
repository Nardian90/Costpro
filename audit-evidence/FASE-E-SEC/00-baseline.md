# FASE E-SEC — 00 BASELINE

## Fecha
2026-09-26 (UTC), ventana 01:30–03:20Z.

## HEAD
```text
HEAD        = 6ac52feb2d1757b15e80915a6fd66541b7f93845
origin/main = 6ac52feb2d1757b15e80915a6fd66541b7f93845
HEAD == origin/main == 6ac52feb  (EXACTAMENTE el SHA esperado por el mandato — sin divergencia)
```

## Comando
```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git log -12 --oneline
```

## Resultado
```text
## main...origin/main
?? audit-evidence/FASE-C2R/10-reverification-r1.md   (preexistente, fuera de alcance — NO commiteado en esta fase)

6ac52feb docs(fase-d): evidencia de certificación funcional de Venta + accesibilidad (13 docs + 21 capturas)
d69d87b1 fix(a11y): tokens --warning/--success alcanzan WCAG AA (4.5:1) en :root
49894c70 fix(pos): carrito en 0 por storeId stale + checkout V2 401 + walk-in 400 — flujo de venta E2E
c0649c05 docs(fase-c2r): post-incident integrity & closure gate …
```

Historial relevante: FASE D terminó en **CONDITIONAL** con hallazgo **R-SEC-1** (doc
`audit-evidence/FASE-D/10-security-production-isolation.md`, líneas 50–58): "el precio
por ítem (price_at_sale) lo fija el cliente; create_sale_v2 valida coherencia interna …
pero NO compara price_at_sale vs products.price por ítem. Demostración: venta aceptada
(200) con price 1.00 en producto de 100.00."

## Interpretación
- Baseline **sin divergencia** respecto al mandato.
- El único untracked (`10-reverification-r1.md`) es evidencia de una fase anterior que
  el usuario no ha ordenado publicar; esta fase no lo toca.
- R-SEC-1 es el hallazgo heredado que FASE E-SEC debe cerrar.

## Tiendas protegidas (regla de la fase)
```text
ENERVIDA-VITALLCONS      = 5e6fe821-5465-48b1-b3f1-3aa3182edc38   → CERO contacto
Puerto Padre VITALLCONS  = 43a4dabc-b8b4-4b66-82b3-0c75335ca5d1   → CERO contacto
TIENDA CENTRAL COSTPRO   = d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576   → CERO contacto
```
Todas las mutaciones de esta fase se realizaron exclusivamente sobre la tienda
sintética `ESEC TEST ESEC0926014201` (205ed126-e976-40cc-985b-cb8d6e44e1ab) con
usuario/usuarios sintéticos, productos sintéticos y stock vía RPC sancionado
`register_stock_movement` (movimiento `initial`), ver doc 01.
