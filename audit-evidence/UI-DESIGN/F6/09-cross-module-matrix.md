# F6 — 09 CROSS-MODULE CONSISTENCY MATRIX (F6-L)

Objetivo: comprobar que POS / Ventas / Inventario / Análisis / Sistema usan la
**misma gramática** (no superficies idénticas). Método: en vivo (journeys) +
primitivos compartidos (código).

Leyenda: ✓ = verificado en vivo en esta fase · (C) = verificado vía código/primitivo
compartido · D = deuda documentada heredada (F4/F5) · — = no aplica a la superficie

| Elemento | POS | Ventas | Inventario | Análisis | Sistema |
|---|---|---|---|---|---|
| PageHeader | — (toolbar F1 propia) | ✓ hub+título | ✓ (título+tabs) | ✓ (dashboard/reportes) | ✓ (Ajustes, Gestión) |
| Primary CTA | ✓ "Cobrar N por $X" | ✓ ACCEDER hub | ✓ CREAR | ✓ por tarjeta | ✓ formularios |
| Secondary CTA | ✓ Historial/Express | ✓ Exportar | ✓ Filtros/Exportar/Importar | ✓ Configurar/Dashboard avanzado | ✓ |
| Breadcrumb | ✓ OPERACIÓN→VENDER | ✓ →VENTAS | ✓ →ALMACÉN→INVENTARIO | ✓ →ANÁLISIS | ✓ →SISTEMA / →GESTIÓN |
| Empty | (C) StateRenderer | (C) StateRenderer | ✓ filtered-empty "LIMPIAR FILTROS" | (C) StateRenderer | (C) StateRenderer |
| Error | (C) DefaultError+Reintentar | (C) | (C) | (C) | (C) |
| Loading | ✓ splash | (C) splash | (C) splash | ✓ splash | (C) splash |
| Modal | ✓ Cobro (BaseModal/Dialog) | ✓ (C) 61 consumidores | ✓ (C) | ✓ (C) | ✓ (C) |
| Badge | ✓ estado caja/turno | ✓ estados venta (gramática token) | ✓ stock | ✓ KPI | ✓ (PageHeader badgeMap) |
| Typography | voz F2 (font-medium) | ✓ cp-page-title | ✓ | ✓ | ✓ |

## Lectura de la matriz

1. **Una sola gramática de CTA**: sólida `bg-primary` con voz `font-medium` en los 5 módulos
   (herencia F2/F5 estable; 0 CTAs gradient/regresión).
2. **Una sola gramática de estado**: StateRenderer + DefaultError/Empty compartidos
   (20 consumidores); filtered-empty con acción de recuperación en tablas.
3. **Una sola gramática de navegación**: breadcrumbs derivados de navigation-definition en
   los 5 módulos; crumb actual marcado; sin crumbs fantasma.
4. **Una sola gramática modal**: BaseModal/Dialog (61 consumidores) con focus trap y Escape.
5. **Diferencias legítimas (no inconsistencias)**: POS conserva su toolbar operacional F1
   (sin PageHeader) por diseño certificado; Inventario usa tabs internas como header (patrón
   F4 aceptado); Análisis usa hubs de tarjetas. Cada diferencia es un patrón certificado,
   no una gramática paralela.
6. Deuda visible y estable: doble-H1 estructural (F4 clase C) — presente por igual en los
   módulos, sin crecimiento.

```text
Los 5 módulos hablan la misma gramática · CROSS-MODULE CONSISTENCY — PASS
```
