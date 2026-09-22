# GATE 1.4P — PRODUCT DECISIONS (RESPUESTA EJECUTIVA PARA PRODUCTO)

Fecha: 2026-09-22 · Baseline `7222b62d` · READ-ONLY cumplido (ver §0 del FINAL-REPORT).
Este documento NO repite el análisis: entrega las respuestas en el formato exigido para que Producto decida. La evidencia detallada vive en `01-product-capabilities.md`, `02-news-board.md`, `03-my-cost-sheets.md`.

---

## DECISIÓN 1 — OFERTAS / CLIENTES CRM / CONCILIACIÓN BANCARIA

### OFERTAS

```text
CAPACIDAD: Ofertas comerciales formales (documento con suministrador/REUP/NIT,
           sellos y firmas, ITBIS, condiciones, PDF oficial)
ESTADO REAL: Stack 100% construido y operativo (UI 1.674 LOC + CRUD API + PDF 29KB),
             inaccesible por navegación (sin menú/palette; breadcrumb falso);
             un acceso contextual existe desde jul-2026 ("Crear oferta" en tarjeta
             "Movimiento lento" del dashboard de tienda — ausente del grep de GATE 1.4)
¿LEGACY?: NO (entregada como feature versionada; cero marcadores de deprecación;
           no sustituida — Cotizaciones es una capacidad distinta y más simple)
¿FUNCIONAL?: SÍ
¿TIENE DATOS?: NO (tabla con RLS migrada 20260612, 0 registros)
¿TIENE USO MEDIBLE?: SÍ, DÉBIL (18 req API: 9 orgánico esparso jun–jul 2026,
           5 pruebas 2026-08-06, 4 auditoría 2026-09-21)
¿FUE SUSTITUIDA?: NO (solapamiento parcial con Cotizaciones: espacio común
           "propuesta comercial", sin tabla/motor/UI compartidos)
DOMINIO PROPUESTO: Ventas (evidencia: acción contextual de promoción en dashboard
           de tienda, agrupación móvil bajo "Vender", naturaleza pre-venta)
ACCIÓN DE PRODUCTO REQUERIDA: Decidir (a) consolidar como capacidad de Ventas
           → requiere acceso discoverable + decisión de solapamiento con
           Cotizaciones; (b) formalizar como legacy con métrica de retiro;
           (c) fusionar con Cotizaciones. NO recomendar "(a)" automático:
           la adopción real es 0 registros.
```

### CLIENTES CRM

```text
CAPACIDAD: CRM-lite de clientes (tabla Supabase customers con campos
           analíticos total_purchases/total_visits/last_visit_date)
ESTADO REAL: UI parcial (listar + buscar + alta; sin editar/eliminar/detalle);
             API parcial (GET+POST); en fragmentación con el catálogo local
             de clientes de IPV (CustomerCatalog sobre Dexie/IndexedDB, 491 LOC,
             CRUD completo local + sync desde transacciones)
¿LEGACY?: INDETERMINADO (migrada como hito V1.2 2026-07-26 con RLS CRUD
           completa; sin marcadores de deprecación; pero la UI nunca
           implementó update/delete que el RLS sí permite)
¿FUNCIONAL?: PARCIAL
¿TIENE DATOS?: SÍ, PERO SOLO SEMILLAS DE PRUEBA ("Hot Customer A/B",
           2026-08-06, teléfonos secuenciales; campos analíticos vacíos)
¿TIENE USO MEDIBLE?: NO (13 req: noche de release V1.2, cluster de pruebas
           2026-08-06, auditoría 2026-09-21 — cero orgánico)
¿FUE SUSTITUIDA?: INDETERMINADO (no hay sustitución documentada, pero
           IPV/Clientes cumple un rol de clientes con otra implementación;
           fragmentación sin resolución)
DOMINIO PROPUESTO: Ventas (CRM) — condicionado a resolver la coexistencia
           con el catálogo de IPV (misma decisión de producto)
ACCIÓN DE PRODUCTO REQUERIDA: Decidir cuál implementación es oficial
           (Supabase vs IPV-local), completar CRUD si sigue adelante, y
           definir si el POS alimenta los campos analíticos.
```

### CONCILIACIÓN BANCARIA

```text
CAPACIDAD: Importación de extractos bancarios + conciliación automática
           con transferencias (RPC auto_match_bank_items)
ESTADO REAL: Backend real (import + match, RPC desplegada V2.1 y endurecida
             en seguridad V2.12.9) con UI esqueleto de 39 LOC solo-lectura;
             el estado vacío le pide al usuario usar el POST de API
             manualmente; ningún componente frontend invoca /match
¿LEGACY?: NO (el motor fue mantenido y parcheado de seguridad dos meses
           después de crearse; no hay marcadores de deprecación)
¿FUNCIONAL?: PARCIAL (backend sí; los flujos de usuario no: sin UI de
             importar, sin UI de conciliar, sin UI de discrepancias)
¿TIENE DATOS?: NO (bank_statements y bank_statement_items: 0 registros)
¿TIENE USO MEDIBLE?: NO (15 req: noche de release V2.1 2026-07-26 incl.
           /match, 1 prueba 2026-08-06, 7 auditoría 2026-09-21)
¿FUE SUSTITUIDA?: NO
DOMINIO PROPUESTO: Finanzas/ANÁLISIS — solo aplica si se decide completarla
ACCIÓN DE PRODUCTO REQUERIDA: Decidir entre (a) completar la UI de los
           dos flujos faltantes (importar + conciliar), o (b) retirar el
           esqueleto UI del árbol técnico y marcar la capacidad como
           pendiente hasta que el producto la pida. Mantenerla como está
           no es una opción segura: sugiere función que no existe.
```

---

## DECISIÓN 2 — TABLÓN DE NOTICIAS

```text
MODELO ACTUAL: Lector RSS server-side de inteligencia de mercado para
MiPymes cubanas (8 feeds activos reales: BCC, FMI, Banco Mundial, OMC,
Cepal, CIAT, BBC Mundo, Granma; 8 categorías temáticas; detección de
tasas BCC; keywords de prioridad fiscales/comerciales). Sin tabla de
noticias propias. Tab default del hub Gestión de Tiendas desde jul-2026.
¿DEPENDE DE TIENDA?: NO (0 columnas store_id; 0 referencias a
activeStoreId en NewsView/useRSS/api)
¿EXISTE CONTENIDO GLOBAL?: SÍ (todo el contenido es global — feeds externos)
¿EXISTE CONTENIDO POR TIENDA?: NO (no hay modelo; store_notifications es
un mecanismo técnico del reset, insert-only, sin lector)
¿CAMBIA CON ACTIVE STORE?: NO
MODELO SEMÁNTICO SUGERIDO: GLOBAL (TRANSVERSAL)
JUSTIFICACIÓN:
1. El contenido (tasas de cambio, normativa fiscal, comercio exterior,
   Gaceta Oficial) es aplicable al usuario independientemente de la
   tienda activa — el modelo de datos lo confirma (sin store_id).
2. La intención histórica documentada (commit b8c15082, 2026-07-12) era
   "news visible para todos" los roles; su posición actual como tab del
   hub de tiendas es efecto mecánico de una reducción de menú, no
   decisión de pertenencia semántica (era item de sidebar en
   ADMINISTRACIÓN y quedó como tab 1 del nuevo hub).
3. Es la capacidad con uso orgánico más sólido de las auditadas en este
   gate (/api/rss: 36+ req recurrentes en ~7 semanas).
4. Contradicción vigente a resolver por Producto: los roles del tab
   incluyen clerk/usuario/warehouse, pero el item del hub que la
   contiene solo es visible para admin/manager/encargado — los roles
   operativos perdieron el acceso de navegación al Tablón.
   (La opción CONTEXTUAL del gate — widget en Inicio, centro de avisos —
   es compatible con el modelo GLOBAL; ambas opciones requieren decisión
   de ubicación que este gate NO implementa.)
```

---

## DECISIÓN 3 — "MIS FICHAS"

```text
¿EXISTE COMO VISTA REAL?: NO (no hay vista de listado gestionable;
  existe un widget "Fichas Recientes" en el Dashboard: top 4, con
  apertura real al editor, que se auto-oculta si no hay fichas)
¿EXISTE SOLO BACKEND?: NO (persistencia real + superficies de lectura
  parciales: widget + Arena FC con búsqueda para comparación)
¿EXISTE SOLO EN EL EDITOR?: PARCIAL — el guardado que persiste en
  servidor nace del editor (DarianEditor → /api/cost-sheets/save,
  INSERT siempre nuevo, store_id obligatorio, cálculo server-side);
  el botón visible "Guardar Ficha" NO persiste (descarga JSON)
¿DEPENDE DEL MVP /FC/?: NO (/fc/FC.html usa localStorage; es MVP
  demostrativo fuera del terminal)
¿ES DESCUBRIBLE?: NO para el novato (el widget exige que ya existan
  fichas; sin menú/palette/hub; "Ver Todas" aterriza en el editor,
  no en un listado)
CLASIFICACIÓN: E — EXISTE PERO ES INCOMPLETA
ACCIÓN DE PRODUCTO:
  La base real existe y está documentada (tabla cost_sheets con 8
  documentos, actividad hasta 2026-09-21; apertura desde el Dashboard;
  comparador Arena FC). Producto puede decidir:
  (a) construir la vista "Mis Fichas" sobre cost_sheets (listar/
      buscar/filtrar/abrir + gestión de ciclo de vida: update/delete/
      duplicar — hoy inexistentes; la ausencia de update produce
      proliferación de versiones, evidenciada por 3 documentos
      idénticos "Ejemplo — Servicio de pintura");
  (b) mantener el estado actual (widget condicionado) documentando
      la limitación; o
  (c) ampliar el alcance a product_cost_sheets (cobertura FC por
      producto, ya visible en Catálogo/Inventario) como parte de la
      misma decisión de producto.
  Unificar la semántica de "Guardar Ficha" (JSON vs servidor) es
  prerrequisito de cualquiera de las tres.
```

---

## Nota de método (por qué estas respuestas son fiables)

- Ningún veredicto "legacy/sustituida" se apoyó en ausencia de menú: se verificó código, migraciones con RLS, datos reales (REST solo-lectura), telemetría por endpoint y arqueología Git.
- Las fechas y clusters de uso se contrastaron con hitos de release (migraciones V1.2 = 2026-07-26, V2.1 = 2026-07-26, semillas = 2026-08-06) y con la ventana de verificación del GATE 1.4R.1 (2026-09-21 11:40) — los patrones orgánicos (ofertas jun–jul, rss continuo) se distinguen de los patrones de prueba.
- Las limitaciones de la telemetría (sin atribución de usuario; posible brecha de instrumentación en /api/cost-sheets/save) se declaran en cada expediente en lugar de inferirse.
