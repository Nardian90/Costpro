# GATE 1.4 — 14 PROPOSED NAVIGATION (GATE 9/23 · arquitectura recomendada — NO IMPLEMENTAR)

Fecha: 2026-09-21 · Derivada de: capacidades reales (01), modelo mental del negocio (06), frecuencias (Vender/POS diario, Caja diaria, fichas frecuentes en dominio Costo), semántica (04/12), contexto (§14), permisos (10), dependencia de tienda activa (03).

## Principios aplicados
1. HUB solo donde hay varias capacidades relacionadas E independientes (Ventas ✓ ya demostrado; Fichas de Costo ahora lo justifica; Almacén/Logística ya lo son).
2. MODOS ≠ VISTAS ≠ ACCIONES ≠ HERRAMIENTAS: Asistido/Informe son modos; Guardar/Export/Import son acciones; Plantillas/Masiva/Estructural/Arena son vistas-herramienta del dominio.
3. Contexto primero: lo que ocurre DENTRO de una ficha abierta sigue en la ficha; el hub solo garantiza el DESCUBRIMIENTO.
4. Tienda activa: el dashboard de la tienda activa ya es accesible desde Inicio; formalizarlo como el único camino necesario + Gestión para multi-tienda.
5. No sacrificar descubribilidad por un menú pequeño: el sidebar crece 2 entradas (justificadas por P0/P1), el detalle va en hubs/palette.

## Arquitectura propuesta

```text
GLOBAL
├── Inicio (dashboard role-aware) .......................... (sin cambio)
├── OPERACIÓN
│   ├── Vender ............................................. (sin cambio)
│   ├── Ventas (hub) ....................................... (sin cambio)
│   │   └── + Ofertas (tarjeta, si se confirma su vigencia) · Clientes (tarjeta CRM)
│   ├── Almacén
│   │   ├── Inventario (tabs) · Servicios · Ajustes · Etiquetas
│   │   └── + Almacenes y Depósitos (MUEVE aquí su breadcrumb)
│   ├── Logística (Recepciones · OC · Transferencias) ...... (sin cambio)
│   ├── Fichas de Costo (HUB — sustituye la entrada única; card-grid como Ventas)
│   │   ├── ✏️ Generar ficha (hero → gen-easy; Rápida/Experta dentro)
│   │   ├── 🗂 Mis fichas (listado/editor — UX-014)
│   │   ├── 🧭 Análisis de Fichas (ex Tablero Dinámico; mantén entrada en ANÁLISIS como atajo)
│   │   ├── 📚 Plantillas (sube desde panel; sin ficha abierta)
│   │   ├── 🎯 Arena FC (beta) — Fase A P0
│   │   ├── ⚙️ Herramientas (grupo secundario): Importar JSON · Generación Masiva · Calculadora Estructural
│   │   └── 🤖 Chat con Darian (contextual; ya global)
│   │   MODOS (se mantienen EN el editor, con descubrimiento por palette-acciones):
│   │      Asistido · Informe · Vistazo · Auditoría · Guardar/Export (acciones del editor)
│   ├── Estructura de Costo · Costeo Dinámico · Órdenes de Producción ..... (resto del dominio Costo)
│   ├── Trabajadores y Comisiones ......................................... (sin cambio)
│   ├── Gestión de Tiendas (hub reordenado)
│   │   ├── 🏬 Tiendas (tab DEFAULT)
│   │   ├── 🛍 Vitrina (ÚNICA entrada; palette "Vitrina" apunta al hub con tab)
│   │   └── 📰 Tablón de Noticias (tab secundaria; evaluar si sube a GLOBAL en Fase B)
│   └── Redes (WhatsApp · Telegram) ....................................... (sin cambio)
├── ANÁLISIS
│   ├── Comparativa de Tiendas (ex "Dashboard de Tiendas")
│   ├── Análisis de Fichas (ex "Tablero Dinámico")
│   ├── Inteligencia Cambiaria · Reportes · Análisis ABC
│   └── + Conciliación Bancaria (si vigente; si no, LEGACY)
├── SISTEMA · AYUDA · EN DESARROLLO ....................................... (sin cambio)
```

## VISTA vs ACCIÓN vs HERRAMIENTA vs MODO vs NAVEGACIÓN (veredicto por capacidad del mandato §5)

| Capacidad | Clase correcta | Dónde vive |
|---|---|---|
| Tablero/Análisis de Fichas | VISTA | Hub Fichas + ANÁLISIS (atajo dual) |
| Generar ficha | VISTA (entrada) | Hub hero |
| Modo Asistido | MODO del editor | Editor + palette-acción "Abrir Modo Asistido" |
| Informe | MODO del editor | Editor + palette-acción "Generar Informe" |
| Arena FC | VISTA (experimentación) | Hub (badge beta) |
| Guardar · Export Excel/PDF · Import JSON | ACCIONES contextuales | Editor (✓ como hoy) + palette-acciones |
| Plantillas · Generación Masiva · Calculadora Estructural | HERRAMIENTAS (vistas de dominio) | Hub > Herramientas |
| DarianAI | VISTA-GLOBAL + CONTEXTO | Como hoy (FAB/palette/rail) + en ficha |
| Exportar PDF (global) | ACCIÓN contextual | NO como vista global |
| Tablero de tiendas | VISTA | ANÁLISIS (renombrar) |
| Dashboard tienda activa | VISTA-contextual | Inicio (✓) + Gestión |

## Command Palette propuesta
- Añadir capa de **ACCIONES**: "Abrir Modo Asistido", "Generar Informe de ficha", "Importar JSON de fichas", "Exportar ficha a Excel/PDF" (activan contexto: abren el módulo y ejecutan/activan), "Abrir turno de caja", "Nueva recepción" (ya existe como vista-acción).
- Registrar con LABEL las vistas técnicas (customers→"Clientes", bank-reconciliation→"Conciliación Bancaria", ofertas→"Ofertas", arena-fc→"Arena FC", templates→"Plantillas"…) — resuelve UX-002 en palette y da base al breadcrumb.
- Ajustar fuzzy para que "json" matchee Importar JSON (keywords explícitas).

## Breadcrumbs propuestos
- `Inicio > OPERACIÓN > Fichas de Costo > Arena FC` (hoy imposible)
- `Inicio > OPERACIÓN > Fichas de Costo > Plantillas`
- `Inicio > OPERACIÓN > Gestión de Tiendas > Vitrina`
- `Inicio > OPERACIÓN > Almacén > Almacenes y Depósitos`
- Regla: toda vista con viewId DEBE tener path (registro técnico con label+padre) — cero "Módulo No Disponible" para vistas reales.

## Mobile propuesta
- Sheet MÁS plegado por sección (Operación/Análisis/…) con los grupos Costo y Tiendas visibles sin scroll infinito.
- El hub Fichas de Costo aparece como card-grid móvil (misma jerarquía que desktop) — Arena FC/Plantillas/Herramientas alcanzables en 2 taps.
- Drawer inicia cerrado en móvil; revisar OCULTAR de la tab bar.

## Qué NO hacer (anti-hub-por-moda)
- NO convertir Asistido/Informe en tarjetas (son modos; duplicarían el editor).
- NO mover Inicio/Dashboard a un hub "Dashboards" (la HOME única funciona).
- NO crear hub "Herramientas" global (las herramientas tienen dominio natural; una global rompería el modelo mental).
- NO tocar Ventas (GATE 1.3 certificado — sirvió de patrón).
