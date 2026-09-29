# F5 — 06 DENSITY AUDIT (A9)

Fecha: 2026-09-29 · Método: capturas desktop 1280×800 (dark) + navegación real de cada superficie. Shots: `shots/before-desktop-*.png`.

| Superficie | Density | Hierarchy | Primary action | Secondary noise | Table readability | Spacing | Mobile (F1) | Empty/Loading/Error |
|---|---|---|---|---|---|---|---|---|
| POS / Vender | alta ✓ operacional | breadcrumb + PageHeader ✓ | ABRIR TURNO claro (estado sin turno) | chips categoría + HISTORIAL azul (info) conviven con verdes | grid productos denso ✓ | correcto | tab bar + toolbar ✓ | estados F3 ✓ |
| Ventas (hub) | media | tiles hub claros | Vender/Caja explícitos | iconos por tile ok | n/a | amplio ok | ✓ | ✓ |
| Historial de Ventas | alta ✓ | PageHeader ✓ | Nueva Venta primaria | filtros densos ok | tabla legible | denso correcto | tabla→cards ✓ | ✓ |
| Caja | media-alta | PageHeader + estado turno | Abrir/Cerrar turno | resúmenes bien jerarquizados | tabla movimientos ok | ok | ✓ | ✓ |
| Inventario | alta ✓ | PageHeader + filtros | Ajustes/Recepción | chips stock ok | tabla/cards ✓ | ok | cards mobile ✓ | skeletons pulse |
| Catálogo | alta ✓ | PageHeader ✓ | CREAR | Exportar/Importar/Incremento (3 secundarios) | tabla ✓ | ok | ✓ | ✓ |
| Recepciones | alta ✓ | breadcrumb F4 ✓ | Nueva Recepción | OCR hint ok | historial legible | ok | ✓ | ✓ |
| Dashboard (tiendas) | media | TABLERO CONSOLIDADO | VISITAR por card | **DASHBOARD/ACTIVAR/VISITAR: 3 CTAs verdes por card + KPI labels font-black uppercase + watermark COSTPRO gigante** | cards ok | padding amplio | ✓ | pulse dots |
| Management Hub | media | Gestión De Tiendas ✓ | Crear/editar tienda | tabs/hub ok | ok | ok | ✓ | ✓ |
| Ajustes | media-baja | secciones card | guardar por sección | **rounded-3xl ×6 + labels font-black** | ok | amplio | ✓ | — |
| Ficha de Costo | alta ✓ | PageHeader ✓ | Nueva FC | tabs/experto ok | tabla FC densa legible ✓ | ok | ✓ | splash decorado (C) |
| IPV / análisis | media-alta | tabs | exportar | **h1 texto degradado (clip-text) + 3 tamaños icon-button** | gráficos legibles | ok | ✓ | ✓ |

## Observaciones transversales

1. **La densidad operacional es ADECUADA** — el problema de lectura no es espaciado sino
   VOZ (font-black uppercase tracking-widest en micro-labels) y ACUMULACIÓN de CTAs verdes
   (dashboard: 3 acciones primarias visuales por tienda).
2. El watermark gigante "COSTPRO" (ParticleBackground) compite con datos detrás de cards en
   dashboard/POS (visible en shots dark y light). Ya excluido en mode-performance → D.
3. Las 12 superficies mantienen jerarquía F2/F4 (PageHeader + breadcrumb global único) —
   sin regresiones estructurales.
4. No se detecta "sobre-espaciado" a corregir; ningún hallazgo P0 de comprensión.
