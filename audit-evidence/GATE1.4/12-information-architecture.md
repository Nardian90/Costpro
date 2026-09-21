# GATE 1.4 — 12 INFORMATION ARCHITECTURE (GATE 16 · modelo de información) + TERMINOLOGÍA (GATE 15)

Fecha: 2026-09-21 · Derivado de la evidencia 01–11. NO ES LA PROPUESTA (esa es 14); este es el modelo de lo que EXISTE clasificado.

## Mapa DOMINIO → SUBDOMINIO → VISTA / ACCIÓN / HERRAMIENTA / MODO / RECURSO (estado actual)

```text
GLOBAL (transversal)
├── Inicio (dashboard role-aware) ......... VISTA
├── Chat con Darian (IA) .................. VISTA-GLOBAL + CONTEXTO (FAB, rail, palette)
├── Calculadora Pro ....................... HERRAMIENTA-GLOBAL
├── Selector de tienda (header/sheet/palette) ... CONTEXTO (3 canales)
├── Centro de Ayuda · Wiki · Academia · Marco Legal ... RECURSO
└── [MVP externo /fc/FC.html — demo rápida, fuera del shell] ... RECURSO-EXTERNO

OPERACIÓN (trabajo diario)
├── Vender (POS) .......................... VISTA-primary
├── Ventas (hub) .......................... HUB ✓ (modelo de referencia)
│   ├── Vender (CTA contextual → pos) ..... ACCIÓN-navegación (misma vista, no duplica)
│   ├── Caja · Historial · Tabla de Venta · Conteo · Devoluciones · Cotizaciones · CxP · CxC · Reporte de Entrega
│   │   ................................... VISTAS contextuales de hub (+palette)
│   └── [Ofertas · Clientes CRM] .......... VISTAS SIN DOMINIO ASIGNADO (orphan)
├── Almacén ............................... HUB-submenu
│   ├── Inventario (Stock/Catálogo/Trazabilidad/Lotes) .. VISTA-módulo con tabs ✓
│   ├── Servicios Recibidos · Ajustes Documentales · Etiquetas ... VISTAS
│   └── [Almacenes y Depósitos] ........... VISTA MISPLACED (breadcrumb en Gestión)
├── Logística ............................. HUB-submenu (Recepciones/Nueva Recepción/OC/Transferencias) ✓
├── Costo (dominio) ....................... HUB-submenu
│   ├── Fichas de Costo ................... VISTA-MÓDULO compleja
│   │   ├── Generar Fácil (gen-easy) ...... VISTA-entrada
│   │   ├── Editor (main) ................. VISTA-núcleo (contexto de todo lo demás)
│   │   ├── Modo Asistido · Informe · Vistazo · Audit ... MODOS del editor (no vistas)
│   │   ├── Guardar · Importar JSON · Exportar Excel/PDF ... ACCIONES del editor ✓
│   │   ├── Plantillas · Generación Masiva · Calculadora Estructural ... HERRAMIENTAS (hoy atrapadas en el panel)
│   │   ├── Arena FC ...................... VISTA-experimentación (ORPHAN)
│   │   ├── Tablero Dinámico (cost-analytics) ... VISTA-análisis (dual-dominio ANÁLISIS)
│   │   └── Darian en ficha (ai-chat) ..... CONTEXTO-IA
│   ├── Estructura de Costo · Costeo Dinámico · Órdenes de Producción ... VISTAS ✓
├── Trabajadores y Comisiones ............. VISTA
├── Gestión de Tiendas .................... HUB
│   ├── Gestión Tiendas (CRUD) ............ VISTA-núcleo ✓
│   ├── Vitrina (config de la tienda activa) ... VISTA-canal (doble entrada)
│   ├── Tablón Noticias ................... RECURSO-transversal (default dudoso)
│   └── [Almacenes y Depósitos] ........... VISTA mispl en breadcrumb
└── Redes (WhatsApp/Telegram hubs) ........ HUB ✓

ANÁLISIS
├── Dashboard de Tiendas .................. VISTA-análisis
├── Tablero Dinámico (de fichas) .......... VISTA-análisis (dual)
├── Inteligencia Cambiaria · Reportes · Análisis ABC ... VISTAS ✓
└── [Conciliación Bancaria] ............... VISTA ORPHAN

SISTEMA (admin) — 8 vistas ✓ · EN DESARROLLO — IPV (rail 23 tabs) · Pick3 · Billetera ✓
```

## Glosario real (GATE 15)

| Concepto | Label actual | Labels históricos/residuales | Label recomendado (no cambiar aún) | Motivo |
|---|---|---|---|---|
| Punto de venta | **Vender** | Terminal de Venta (keyword), TPV (heading POS), punto_venta (alias) | Vender ✓ | Verbo correcto (GATE 1.3) |
| Admin ciclo comercial | **Ventas** | Venta, "Gestión de ventas" | Ventas ✓ | Sustantivo sin colisión |
| Caja | **Caja** | Arqueo de Caja (keyword), Cierre de Caja | Caja ✓ | Un concepto (turno+fondos+entrega) |
| Reporte de entrega | **Reporte de Entrega** | cash_report | ✓ | — |
| Tablero de análisis de fichas | **Tablero Dinámico** | **Tablero Principal** (tip legacy en store migration), cost-analytics | "Análisis de Fichas" / "Tablero de Fichas" | "Dinámico" no dice de qué; colisiona |
| Dashboard consolidado | **Inicio** (heading interno TABLERO CONSOLIDADO) | Dashboard, occ, analitica | Inicio ✓ | HOME única correcta |
| Dashboard por tienda | **Dashboard** / "Dashboard KPI avanzado" / "Dashboard avanzado" (3 labels de botones en la MISMA card) | — | "Dashboard de la tienda" único label | 3 labels para 1-2 acciones reales = ruido |
| Vista de tiendas | **Dashboard de Tiendas** | — | "Comparativa de Tiendas" | "Dashboard" duplica a Inicio en el mismo menú lateral |
| Módulo de fichas | **Fichas de Costo** | Generar fichas, "GENERAR FÁCIL" (h1 interno), Ficha de Costo (singular MVP) | Fichas de Costo ✓ | — |
| Sub-herramienta de generación | **GENERACIÓN RÁPIDA / EXPERTA** | gen-quick, gen-expert (alias), B4 "Generar fácil" | ✓ | — |
| Modo guiado | **Asistido** (panel) / Modo Asistido (tips) | view-assisted (tab técnica) | "Modo Asistido" | Unificar (panel dice solo "Asistido") |
| Salida formal | **Informe** (panel) | view-reading, "Informe de Costo" (h2), "Informe"≠"Reportes" | "Informe de la ficha" | Distinguir de Reportes (ANÁLISIS) |
| Comparador | **Arena FC** | — | Arena FC (con badge beta) | Nombre propio de producto |
| Export/Import | **Exportar Excel/PDF, Guardar (JSON), Importar JSON** | tool-* (tabs técnicas) | ✓ (como acciones) | — |
| Escaparate digital | **Vitrina** (tab) / **Vitrina Pública** (palette) | storefront-config, "Vitrina digital" | UN SOLO label ("Vitrina") | Dos nombres para una entrada |
| Lector de noticias | **Tablón Noticias** / "Tablón de Noticias" (breadcrumb) / AGREGADOR DE NOTICIAS (h2) | — | UN SOLO label | 3 variantes visibles |
| CRM | **Clientes** (CustomersView) | customers | "Clientes" | Hoy sin camino |
| Conciliación | **Conciliación Bancaria** | bank-reconciliation | — | Hoy sin camino |
| Promociones | **Ofertas** | — | — | Hoy sin camino |
| IPV | **IPV** | ipv_reporting…ipv_avanzado, otros (alias) | IPV ✓ | Rail interno documentado |
| Términos correctos residual-check | Vender✓, Caja✓, Fichas✓, IPV✓ | **Tabla IPV** (no encontrado en UI viva), **Venta por Conteo** ✓ correcto y único, **Conteo de Inventario** (no está en UI — correcto, se llamaba así históricamente) | — | Limpieza histórica ya aplicada en su mayoría |

## Conclusión del modelo

1. El modelo mental **Operación=trabajo / Análisis=leer / Sistema=administrar / Ayuda=aprender** se sostiene en el 90% del árbol.
2. Las roturas del modelo se concentran en: (a) dominio Costo —mezcla vista/modo/herramienta sin caminos—, (b) Gestión de Tiendas —default transversal + almacenes mal colgados—, (c) capacidades sin dominio (Ofertas/Clientes/Conciliación), (d) vocabulario dashboard/tablero/vitrina/tablón no normalizado.
3. Principio de contexto (§14) YA se aplica bien en Ventas (tarjetas) y en el editor de fichas (acciones); la deuda es que las herramientas/modos del editor **también** necesitan caminos de descubrimiento global (palette/hub) sin convertirlos en vistas.
