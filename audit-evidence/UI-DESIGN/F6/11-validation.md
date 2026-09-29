# F6 — 11 VALIDATION (F6-O / F6-P / F6-Q)

## F6-O — Validación estática

```text
Comando:    bunx tsc --noEmit            → exit 0
TypeScript: 0 errors

Comando:    npm run lint                 → exit 0
ESLint:     0 errors, 1297 warnings
            (warnings advisory "usar <Button> en vez de <button> crudo" — patrón
             preexistente documentado desde F4; 0 errores; nada nuevo atribuible a F6)

Comando:    npm test -- --run            → exit 0
Tests:      2387 passed / 24 skipped / 0 failed  (118 files passed, 1 skipped)
Baseline F5: 2387/24/0 → idéntico. 0 regresiones atribuibles a F6.
```

## F6-P — Build

```text
Comando:  npm run build (pm2 detenido, ~3.4GiB libres)
Resultado: "Creating an optimized production build ..." → Killed (OOM del kernel)
```

* **5ª ocurrencia documentada** del mismo límite de entorno (REM-V2-1/2/3, PRE-F5, F5):
  caja de 4 GiB RAM no soporta el build de producción de Next.js 16 de este repo.
* **No se altera arquitectura** para acomodar el entorno (regla F6-P).
* **CI = autoridad del build**: los PRs #1335 y #1336 (F5) pasaron CI en el runner de 7 GiB;
  `origin/main` (336b2e5a) es verde. La rama F6 no modifica código de aplicación
  (solo añade evidencia), por lo que el resultado de CI de main es representativo.
  Debe ejecutarse CI sobre `audit/f6-transversal-ux-qa` tras el push.

## F6-Q — Live regression (smoke real, DOM verificado)

| # | Superficie | URL/entrada | Resultado |
|---|---|---|---|
| 1 | Landing | `/` | H1+CTAs ✓ |
| 2 | Login | modal "Iniciar sesión" | campos/labels ✓ |
| 3 | POS (Vender) | `?view=pos` | grilla+carrito+cobro ✓ |
| 4 | Ventas hub | `?view=sales-hub` | tarjetas ✓ |
| 5 | Historial | `?view=sales` | tabla+export ✓ |
| 6 | Caja | `?view=cash` | ✓ |
| 7 | Devoluciones | `?view=devolutions` | ✓ |
| 8 | Cotizaciones | `?view=quotations` | ✓ |
| 9 | Inventario | `?view=inventory` | tabs ✓ |
| 10 | Catálogo (tab) | filtro + empty | ✓ |
| 11 | Recepciones | `?view=reception_list` | ✓ |
| 12 | Venta por Conteo | `?view=inventory_count` | ✓ |
| 13 | Dashboard | `?view=dashboard` | KPIs ✓ |
| 14 | Reportes | `?view=reports` | ✓ |
| 15 | IPV | `?view=ipv` | ✓ |
| 16 | Ficha de Costo | `?view=cost-sheets` | ✓ |
| 17 | Ajustes | `?view=settings` | ✓ |
| 18 | Gestión de Tiendas | `?view=management-hub` | ✓ |
| 19 | Mobile navigation | 390×844 | tab bar+drawer+StickyCart ✓ |
| 20 | Ruta inexistente | `?view=management` | fallback honesto ✓ |

Nota de honestidad: durante la sesión, `localStorage.clear()` (propio del tester)
cerró la sesión y la app cayó a la landing pública — comportamiento correcto de
auth, no defecto; re-login y re-verificación completas OK.

## Regresión cruzada F1–F5

| Fase | Invariantes verificados en F6 | Resultado |
|---|---|---|
| F1 | MobileTabBar 6 botones 48–49px; drawer "Más"+Escape; StickyCart 72px; toolbar POS; safe targets | **PASS** |
| F2 | tokens.css, button.tsx (voz font-medium), PageHeader, jerarquía tipográfica | **PASS** |
| F3 | StateRenderer/BaseModal/focus/Escape/toaster; filtered-empty con recuperación | **PASS** |
| F4 | navigation-definition fuente única (10 importadores); nomenclatura sin "Terminal de Venta"; breadcrumbs reales; deep-links 16/16; sin rutas falsas | **PASS** |
| F5 | DIAG=0; muertos sin referencias rotas; IPVView/KnowledgeTab/dashboard-CTAs sin regresión; debt counts estables (font-black 4242≈4245; text-[7px] 12 archivos); perf-hide-decor 6/6 | **PASS** |

## Servidor

```text
pm2: 3 procesos online (costpro + 2 pollers) · HTTP 200 · GET /?view=* 200s <300ms
```
