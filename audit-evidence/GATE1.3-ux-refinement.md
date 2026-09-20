# GATE 1.3 — UX NAVIGATION REFINEMENT (Venta)

Base: commit `b9b74172` · HEAD main · PM2 costpro online · READ-ONLY audit + diseño antes de implementar.

## 1. ESTADO ACTUAL (evidencia por superficie)

| Superficie | pos | sales-hub |
|---|---|---|
| Sidebar desktop | **Terminal de Venta** | **Venta** |
| Tab móvil | **Vender** (ya!) | (card "Venta" en sheet Más) |
| Palette ⌘K | Terminal de Venta | Venta |
| Breadcrumb pos | Operación > Venta > Terminal de Venta | — |
| Header | Terminal de Venta | Venta |
| Tarjeta hub | Terminal de Venta | (es el hub: h2 "Venta") |
| Shortcut | Ctrl+2 "Terminal de Venta" | — |

### Duplicación conceptual detectada (3 nombres por concepto)

| Concepto | Nombre nav | Título interno h2 | Boundary shell |
|---|---|---|---|
| Caja (`cash`) | Caja | **Arqueo de Caja** | **Cierre de Caja** |
| Tabla de Venta (`sales_catalog`) | Tabla de Venta | **Tabla IPV** ← colisión con módulo IPV | **Catálogo de Ventas** |
| Venta por Conteo (`inventory_count`) | Venta por Conteo | **Auditoría de Stock** | **Conteo de Inventario** |
| Historial (`sales`) | Historial de Ventas | Ventas | Historial de Ventas ✓ |

- Hub `sales-hub` (SalesHubView): 2 PRIMARY (Terminal de Venta→pos, Tabla de Venta→sales_catalog) + 7 SECONDARY (Historial de Ventas→sales, Caja→cash, Venta por Conteo→inventory_count, Devoluciones→devolutions, Cotizaciones→quotations, Cuentas por Pagar→accounts_payable, Cobros por Antigüedad→accounts_receivable). Sin filtro de rol por tarjeta.
- `history` NO es historial de ventas (es kardex/Trazabilidad de stock) — el hub correctamente no lo enlaza.
- Cotizaciones: GET+POST reales, estados definidos, **conversión a venta NO implementada** (la tarjeta la promete — copy falso).
- Devoluciones: V1 real (API + reversa + duplicado).
- Palette: buscar "caja" NO llega a la vista Caja (vista técnica fuera del palette); 'caja' es keyword de pos (misleading).
- Móvil: Vender→pos 1 tap; Caja→cash 1 tap (tab); secundarias 3 taps (Más→Venta→tarjeta). SpeedDial "Caja (n)" del POS abre el CARRITO (colisión de nombre, fuera de alcance).
- Navegación 100% por ID (palette/sidebar/móvil/breadcrumb/header/IA/shortcuts): renombrar labels es seguro.
- Duplicados hardcodeados a sincronizar: VIEW_TO_HUB_MAP.leafLabel ↔ tarjetas del hub; SHORTCUTS_REGISTRY Ctrl+2; viewNames del shell.

## 2. ARQUITECTURAS CONSIDERADAS (criterios §16, sin puntuación política)

### Alternativa A — `Vender` → POS directo; resto contextual dentro del POS
POS ya expone Registro→sales y widget de turno→cash. Pero: oculta la administración del dominio dentro de una vista de flujo de trabajo; encargado/manager necesitan Caja/Historial/Devoluciones/cuentas SIN entrar a un flujo de venta; las 7 tarjetas del hub quedarían huérfanas (solo palette); information scent débil para "quiero ver mis ventas anteriores" (¿eso vive "dentro de vender"?). Móvil sobrevive por su tab Caja; desktop no tiene equivalente.

### Alternativa B — `Vender` abre hub (Nueva venta, Historial, Caja, …)
Concepto único, pero la acción MÁS FRECUENTE (vender, docenas de veces/día para clerk) pasa a 2 clicks — contradice evidencia M-3 (GATE 0: el clerk no debe pagar 2 clicks diarios) y la regla §8 del propio gate (POS en 1 click). El hub se vuelve intermediario obligatorio. Es esencialmente el hub actual con otro nombre.

### Alternativa C — `Vender` → POS (1 click) + `Ventas` (hub de administración) ✅ RECOMENDADA
- **Vender** (verbo, acción, id `pos`) → POS directo, 1 click.
- **Ventas** (sustantivo, dominio, id `sales-hub`) → hub: Nueva Venta, Tabla de Venta | Historial de Ventas, Caja, Venta por Conteo, Devoluciones, Cotizaciones, Cuentas por Pagar, Cobros por Antigüedad.
- Par verbo/sustantivo estándar en software empresarial (Odoo: Point of Sale vs Sales; Shopify: POS vs Orders; ERP: "Ventas" como módulo + POS como acción).
- **El móvil YA implementa C** (tab Vender→pos, tab Caja→cash, sheet→hub): desktop converge al modelo mental ya vivo en móvil → consistencia entre superficies.
- Caja: 2 clicks desktop (Ventas→Caja), 1 tap móvil (tab). Cumple §8.
- Progressive disclosure: la división PRIMARY/SECONDARY del hub ES el "Más" — no se necesita un grupo literal "Más"; el nombre del hub ("Ventas") explica el contenido (regla: el nombre del grupo explica qué hay dentro).

## 3. RESPUESTAS §17

1. **Mejor estructura**: C (frecuencia + precedente móvil + patrón empresarial).
2. **Visibles**: sidebar = Vender + Ventas; hub: las 8 tarjetas actuales (Nueva Venta renombra a "Terminal de Venta"→task-oriented).
3. **"Más"**: el grid secundario del hub cumple ese rol; en palette entran directo las 7 secundarias como extensiones palette-only (mobileHide) — sin duplicar navegación visible.
4. **Historial directo**: en hub (2 clicks); no en sidebar (consulta, no acción diaria).
5. **Caja visible**: hub (2 clicks desktop / 1 tap móvil); subirla a sidebar inflaría OPERACIÓN (es operación por turno, no continua).
6. **Venta por Conteo**: visible en hub (madura: API real); label de negocio correcto; se corrige h2 interno.
7. **Devoluciones/Cotizaciones**: Devoluciones madura (publicada). Cotizaciones publicada PERO se corrige el copy que promete conversión no implementada.
8. **Escondidas que deban aparecer**: ninguna; `cash_report` permanece contextual (se alcanza desde Caja).
9. **Sobran**: nada; tarjeta del hub "Terminal de Venta" → "Nueva Venta".
10. **Mobile**: C ya es la estructura móvil; labels intactos; profundidad máx. 3 taps (Más→Ventas→Devoluciones).

## 4. DECISIONES DE LABELS (§12 consistencia)

| Vista | Sidebar | Header/Breadcrumb | Tarjeta hub | h2 interno | Palette |
|---|---|---|---|---|---|
| pos | **Vender** | Inicio > Operación > Vender | Nueva Venta | (sin h2 — flujo) | Vender (+kw pos/terminal/cobrar) |
| sales-hub | **Ventas** | Inicio > Operación > Ventas | (es el hub) | Ventas | Ventas |
| sales | — | … > Ventas > Historial de Ventas | Historial de Ventas | Historial de Ventas | ext. Historial de Ventas |
| cash | — | … > Ventas > Caja | Caja | Caja | ext. Caja (kw arqueo/turno/cierre) |
| sales_catalog | — | … > Ventas > Tabla de Venta | Tabla de Venta | Tabla de Venta | (kw del hub) |
| inventory_count | — | … > Ventas > Venta por Conteo | Venta por Conteo | Venta por Conteo | ext. Venta por Conteo |
| devolutions | — | … > Ventas > Devoluciones | Devoluciones | Devoluciones | ext. Devoluciones |
| quotations | — | … > Ventas > Cotizaciones | Cotizaciones | Cotizaciones | ext. Cotizaciones |
| accounts_payable | — | … > Ventas > Cuentas por Pagar | Cuentas por Pagar | Cuentas por Pagar | ext. Cuentas por Pagar |
| accounts_receivable | — | … > Ventas > Cobros por Antigüedad | Cobros por Antigüedad | Cobros por Antigüedad | ext. Cobros por Antigüedad |

- "Terminal de Venta" desaparece como label visible; sobrevive como keyword de búsqueda (recognition over recall).
- 'caja' se quita de keywords de pos y sales-hub → "caja" resuelve ÚNICAMENTE a la acción Caja.
- Ctrl+2 sigue apuntando a `pos` (sin romper); registro actualizado a "Vender".
- BackToVentaButton: "← Venta" → "← Ventas" (default label).
- IA prompt: "Vender (Terminal de Venta / POS): pos".

## 5. INVARIOS (sin cambios)

IDs técnicos (`pos`, `sales-hub`, `sales`, `cash`, `sales_catalog`, `inventory_count`, `devolutions`, `quotations`, `accounts_payable`, `accounts_receivable`, `cash_report`) · rutas URL `?view=` · LEGACY_VIEW_ALIASES · roles/permisos/RLS · componentes · backend · MOBILE_MAIN_TABS (labels Vender/Recibir/Inventario/Caja ya correctos) · módulo POS (cero lógica).

## 6. TESTS A ACTUALIZAR

- gate1-navigation.test.ts:232-235 — pos breadcrumb pasa a `['OPERACIÓN', 'Vender']`.
- gate1-navigation.test.ts:237-240 — sales breadcrumb pasa a `['OPERACIÓN', 'Ventas', 'Historial de Ventas']`.
- Nuevos asserts: extensiones palette-only presentes; "caja" → acción Caja única; 0 duplicados (test existente de IDs únicos cubre).
