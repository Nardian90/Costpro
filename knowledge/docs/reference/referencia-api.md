# Referencia de la API de CostPro

Documentación técnica completa de los endpoints REST disponibles en la plataforma CostPro v5.8. Todos los endpoints se encuentran bajo la ruta base `/api/` y utilizan **JSON** como formato de intercambio principal.

---

## Tabla de Contenidos

- [Autenticación](#autenticación)
- [Fichas de Costo](#fichas-de-costo)
- [Inventario](#inventario)
- [Gestión de Usuarios](#gestión-de-usuarios)
- [IA e Inteligencia](#ia-e-inteligencia)
- [Academia](#academia)
- [Sistema](#sistema)
- [Códigos de Error](#códigos-de-error)

---

## Autenticación

CostPro utiliza **Supabase Auth** como proveedor de identidad. No existen endpoints personalizados de autenticación; toda la gestión de sesiones se realiza a través del SDK cliente de Supabase.

### Métodos del SDK de Supabase Auth

```typescript
// Iniciar sesión
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@empresa.cu',
  password: '********'
});

// Cerrar sesión
await supabase.auth.signOut();

// Obtener sesión actual
const { data: { session } } = await supabase.auth.getSession();
```

### Header de Autorización

Para los endpoints que requieren autenticación, envía el **JWT de Supabase** en el header `Authorization`:

```
Authorization: Bearer <supabase_jwt_token>
```

> **Nota:** El servidor valida el token mediante `getServerSession(req)`, que extrae y verifica automáticamente el JWT desde las cookies o el header de autorización.

---

## Fichas de Costo

Módulo central de cálculo de costos. El motor de cálculo utiliza **Decimal.js** para garantizar precisión aritmética en todas las operaciones financieras.

### `POST /api/cost-sheets/calculate`

Ejecuta el motor de cálculo de costos del lado del servidor. Realiza validación de esquema (Zod), validación semántica y calcula todos los totales, subtotales, auditorías y errores.

**Body:**
```json
{
  "meta": {
    "id": "FC-2024-001",
    "name": "Pan Integral",
    "currency": "CUP",
    "decimals": 2,
    "quantity": 100,
    "settings": { "allowFormulas": true }
  },
  "anexos": [
    {
      "id": "I",
      "name": "Materia Prima e Insumos",
      "rows": [
        {
          "classification": "1.1.1",
          "description": "Harina de trigo",
          "um": "kg",
          "consumption_norm": 0.5,
          "price": 25.00,
          "importe": 12.50
        }
      ]
    }
  ],
  "rows": [
    {
      "id": "1",
      "parentId": null,
      "classification": "1",
      "label": "Gastos Directos",
      "type": "TOTAL",
      "formaCalculo": "FIJO",
      "valorHistorico": 0,
      "formula": "sum(children)"
    }
  ]
}
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "rows": [
    {
      "id": "1",
      "classification": "1",
      "label": "Gastos Directos",
      "type": "TOTAL",
      "total": 1250.00,
      "valorHistorico": 1200.00,
      "calculatedVH": 1200.00,
      "baseTotal": null,
      "baseHist": null,
      "fuente": null
    }
  ],
  "deepValidationErrors": [
    {
      "type": "WARNING",
      "category": "Precisión",
      "rowId": "3.2.1",
      "message": "El valor histórico difiere más del 15% del calculado"
    }
  ]
}
```

**Autenticación:** No requerida (endpoint público de cálculo).

---

### `POST /api/cost-sheets/save`

Guarda una ficha de costo en la base de datos de Supabase. Ejecuta el motor de cálculo internamente antes de persistir los datos y almacena un snapshot del resultado.

**Body:**
```json
{
  "updateData": {
    "header": {
      "name": "Pan Integral",
      "code": "FC-2024-001",
      "category": "Alimentos",
      "currency": "CUP",
      "quantity": 100,
      "unit": "u"
    },
    "annexes": [
      {
        "id": "I",
        "title": "Materia Prima",
        "data": [
          {
            "description": "Harina de trigo",
            "consumption_norm": 0.5,
            "price": 25.00,
            "total": 12.50,
            "classification": "1.1.1"
          }
        ]
      }
    ],
    "resetBeforeApply": false
  },
  "currentData": null
}
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "message": "Ficha generada y guardada correctamente",
  "id": "uuid-de-la-ficha",
  "data": { ... }
}
```

**Autenticación:** Requerida (sesión de Supabase).

---

### `POST /api/cost-sheets/export-pdf`

Genera un documento **PDF** profesional de la ficha de costo, conforme a la **Res. 148/2023 de Control Interno**. Soporta formatos estándar y pro, con inclusión opcional de anexos, auditoría y notas de utilidad.

**Body:**
```json
{
  "result": {
    "header": {
      "name": "Pan Integral",
      "code": "FC-2024-001",
      "currency": "CUP",
      "quantity": 100
    },
    "rows": [ ... ],
    "anexos": [ ... ],
    "signature": {
      "prepared_by": "Lic. María García",
      "approved_by": "Ing. Carlos López"
    }
  },
  "exportOptions": {
    "includeFC": true,
    "includeAudit": true,
    "includeAnnexes": ["I", "II", "III"],
    "skipZeros": false,
    "includeUtilityNote": true,
    "pdfFormat": "pro",
    "showDateTime": true
  }
}
```

**Respuesta:** Devuelve el PDF como buffer binario con headers:

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="ficha-FC-2024-001.pdf"
```

**Autenticación:** No requerida (generación directa).

---

### `POST /api/cost-sheets/import-json`

Importa una ficha de costo desde un objeto JSON. Valida el esquema con Zod (`FichaJSONSchema`) y devuelve la estructura parseada.

**Body:** Objeto JSON completo de la ficha (mismo esquema que `calculate`).

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "ficha": { ... }
}
```

**Autenticación:** No requerida.

---

### `POST /api/cost-sheets/import-anexo`

Importa datos de un anexo desde archivo **CSV** o **Excel (.xlsx/.xls)**. Soporta normalización automática de columnas y cálculo de totales por clasificación.

**Body:** `multipart/form-data` con los siguientes campos:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `file` | File | Archivo CSV o Excel |
| `anexoId` | string | ID del anexo destino (I, II, III, IV, V) |

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "anexoId": "I",
  "summary": {
    "rowCount": 15,
    "sumByClassification": {
      "1.1.1": 450.00,
      "1.1.2": 320.50
    },
    "totalImporte": 770.50
  },
  "rows": [ ... ]
}
```

**Autenticación:** No requerida.

---

### `POST /api/cost-sheets/ai/chat`

Chat con **Darian AI**, el asistente inteligente especializado en costos y la Res. 148/2023. Genera propuestas de fichas de costo, analiza datos y responde preguntas técnicas.

**Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Genera una ficha de costo para producción de pan integral con capacidad de 1000 unidades diarias"
    }
  ],
  "sheetData": {
    "header": { "name": "Pan Integral", "currency": "CUP" },
    "sections": [ ... ],
    "annexes": [ ... ],
    "summary": { "totalCost": 4500 }
  },
  "aiProvider": "gemini",
  "aiApiKey": "opcional-clave-personalizada"
}
```

**Respuesta exitosa (200):**
```json
{
  "text": "He preparado una propuesta técnica detallada...",
  "metadata": {
    "provider": "gemini"
  }
}
```

**Autenticación:** Requerida.

---

## Inventario

Gestión de existencias con soporte para control de versiones optimista (optimistic concurrency control), movimientos de stock y Kardex por producto.

### `GET /api/inventory`

Consulta niveles de inventario con paginación y filtros. Retorna datos del inventario junto con la información del producto asociado.

**Parámetros de consulta:**

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `page` | number | 1 | Número de página |
| `pageSize` | number | 20 | Elementos por página |
| `sku` | string | — | Filtro por SKU (búsqueda parcial) |
| `storeId` | string | — | Filtro por tienda |

**Respuesta exitosa (200):**
```json
{
  "data": [
    {
      "productId": "uuid-producto",
      "sku": "HAR-001",
      "name": "Harina de trigo",
      "quantity": 500,
      "version": 12
    }
  ],
  "pagination": {
    "totalItems": 45,
    "currentPage": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

**Autenticación:** Requerida.

---

### `GET /api/inventory/products`

Obtiene la lista de productos con stock disponible para el punto de venta (POS), calculada mediante el RPC `get_products_for_pos`. Usa automáticamente la tienda activa del usuario.

**Respuesta exitosa (200):** Array de productos con datos de inventario calculados.

**Autenticación:** Requerida.

---

### `POST /api/inventory/adjust`

Ajuste rápido de inventario con **control de concurrencia** basado en versiones. Utiliza el RPC `register_stock_movement` de Supabase.

**Body:**
```json
{
  "productId": "uuid-producto",
  "storeId": "uuid-tienda",
  "quantity": 50,
  "movementType": "ajuste_manual",
  "version": 12,
  "reason": "Conteo físico - ajuste por diferencia"
}
```

**Respuesta exitosa (200):**
```json
{
  "productId": "uuid-producto",
  "newQuantity": 550,
  "newVersion": 13
}
```

**Error de concurrencia (409):**
```json
{
  "error": "Conflict",
  "message": "Inventory version mismatch.",
  "serverVersion": 14,
  "currentQuantity": 580
}
```

**Autenticación:** Requerida.

---

### `POST /api/inventory/adjustments`

Ajuste formal de inventario basado en documentos. Procesa múltiples productos en lote mediante el RPC `process_inventory_adjustment` y genera un registro de venta/salida documentado.

**Body:**
```json
{
  "storeId": "uuid-tienda",
  "items": [
    {
      "product_id": "uuid-producto-1",
      "quantity": -10,
      "reason": "Ajuste por merma"
    },
    {
      "product_id": "uuid-producto-2",
      "quantity": 5,
      "reason": "Recepción no documentada"
    }
  ]
}
```

**Respuesta exitosa (200):**
```json
{
  "message": "Inventory adjustment processed successfully",
  "saleId": "uuid-sale",
  "saleItems": [ ... ]
}
```

**Autenticación:** Requerida.

---

### `GET /api/inventory/[productId]/history`

Historial de movimientos de stock (Kardex) de un producto específico. Soporta paginación y filtro por tienda.

**Parámetros de consulta:**

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `page` | number | 1 | Número de página |
| `pageSize` | number | 20 | Elementos por página |
| `storeId` | string | — | Filtro por tienda |

**Respuesta exitosa (200):**
```json
{
  "data": [
    {
      "movementId": "uuid-movimiento",
      "timestamp": "2024-12-15T14:30:00Z",
      "quantityChange": -10,
      "movementType": "sale"
    },
    {
      "movementId": "uuid-movimiento-2",
      "timestamp": "2024-12-14T09:00:00Z",
      "quantityChange": 100,
      "movementType": "reception"
    }
  ],
  "pagination": {
    "totalItems": 25,
    "currentPage": 1,
    "pageSize": 20,
    "totalPages": 2
  }
}
```

**Autenticación:** Requerida.

---

## Gestión de Usuarios

Endpoints administrativos para la gestión de cuentas de usuario. Todos requieren rol de **admin** o **encargado**, con jerarquía de permisos basada en roles.

### `POST /api/users/managed-create`

Crea un nuevo usuario gestionado. El solicitante debe tener rol `admin` (puede crear cualquier rol) o `encargado` (no puede crear admins). Si no se proporciona contraseña, se envía un correo de recuperación.

**Body:**
```json
{
  "p_email": "nuevo.usuario@empresa.cu",
  "p_password": "ClaveSegura123!",
  "p_full_name": "Juan Pérez Martínez",
  "p_role": "encargado",
  "p_store_id": "uuid-tienda",
  "p_memberships": ["uuid-tienda-1", "uuid-tienda-2"],
  "p_max_stores": 5,
  "p_max_users": 20
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "user_id": "uuid-nuevo-usuario",
  "message": "Usuario creado correctamente."
}
```

**Autenticación:** Requerida (admin o encargado).

---

### `POST /api/users/delete`

Elimina un usuario de forma segura (soft-delete via RPC `managed_delete_user` y hard-delete en `auth.users`).

**Body:**
```json
{
  "user_id": "uuid-usuario-a-eliminar"
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Usuario eliminado correctamente"
}
```

**Autenticación:** Requerida (solo admin).

---

### `POST /api/users/reset-password`

Envía un correo de recuperación de contraseña al usuario especificado. No permite establecer la contraseña directamente por razones de seguridad.

**Body:**
```json
{
  "user_id": "uuid-usuario"
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Se ha enviado un correo de recuperación al usuario."
}
```

**Autenticación:** Requerida (solo admin).

---

### `POST /api/users/toggle-status`

Activa o desactiva una cuenta de usuario. Registra la acción en `user_audit_log` para trazabilidad.

**Body:**
```json
{
  "user_id": "uuid-usuario",
  "is_active": false
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true
}
```

**Autenticación:** Requerida (admin, encargado, superadmin o manager).

---

## IA e Inteligencia

### `POST /api/bot/chat`

Chatbot general de IA con soporte para múltiples proveedores LLM y claves API personalizadas por usuario. Utiliza el orquestador centralizado `getLLMProviderWithUserKey`.

**Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "¿Cómo puedo mejorar la gestión de inventario de mi tienda?"
    }
  ],
  "aiProvider": "gemini",
  "aiApiKey": "opcional-clave-personalizada",
  "storeId": "uuid-tienda"
}
```

**Respuesta exitosa (200):**
```json
{
  "text": "Para mejorar la gestión de inventario te recomiendo...",
  "metadata": {
    "provider": "gemini"
  },
  "timestamp": "2024-12-15T14:30:00.000Z"
}
```

**Error de cuota (502):**
```json
{
  "error": "Límite de IA alcanzado",
  "details": "Cuota excedida para el proveedor actual"
}
```

**Autenticación:** Requerida. Timeout: 60s.

---

### `POST /api/reports/generate`

Genera reportes PDF personalizados. Soporta múltiples tipos de reporte con filtros avanzados y almacenamiento automático en Supabase Storage.

**Body:**
```json
{
  "type": "sales",
  "report_definition_id": "uuid-definicion",
  "name": "Reporte de Ventas - Diciembre 2024",
  "date_range": {
    "from": "2024-12-01",
    "to": "2024-12-31"
  },
  "filters": { "product_id": "uuid-producto" },
  "columns": ["date", "product_name", "quantity", "total_amount"],
  "store_id": "uuid-tienda",
  "orientation": "portrait",
  "format": "a4"
}
```

**Tipos de reporte disponibles:**

| Tipo | Descripción | Requiere `filters` |
|------|-------------|-------------------|
| `sales` | Transacciones/ventas | No |
| `inventory` | Estado de inventario | No |
| `cost_sheet` | Ficha de costo (datos en body) | No |
| `audit` | Logs de auditoría | No |
| `profit` | Análisis de rentabilidad | No |
| `kardex` | Movimientos de stock por producto | Sí (`product_id`) |
| `purchases` | Compras/recepciones | No |
| `daily_income` | Ingresos diarios agregados | No |
| `daily_expenses` | Gastos diarios agregados | No |

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "url": "https://storage.supabase.co/reports/sales/uuid-run.pdf",
  "run_id": "uuid-ejecucion"
}
```

**Autenticación:** Requerida.

---

### `GET /api/intelligence`

Datos de inteligencia y analítica del sistema. Retorna métricas de arquitectura, health scores, grafo de conocimiento y estado de la documentación.

**Respuesta exitosa (200):**
```json
{
  "audit": { "healthScore": 9.0, "documentationScore": 8.5 },
  "metrics": { "summary": { "avg_instability": 0.12 } },
  "graph": { "nodes": [], "edges": [] },
  "knowledgeGraph": { ... },
  "healthSummary": {
    "timestamp": "2024-12-15T14:30:00.000Z",
    "integrityScore": 88,
    "status": "STABLE"
  },
  "docsList": ["api-reference.md", "getting-started.md"]
}
```

**Autenticación:** No requerida (endpoint público de telemetría).

---

## Academia

Sistema de aprendizaje basado en **repetición espaciada (algoritmo SM-2)** con tarjetas educativas generadas por IA a partir de manuales técnicos en PDF.

### `POST /api/academy/generate`

Genera tarjetas de aprendizaje (flashcards) a partir de un manual PDF del directorio `public/manuals/`. Soporta archivos JSON complementarios para datos estructurados.

**Body:**
```json
{
  "filename": "Res-148-2023-Control-Interno.pdf",
  "limit": 3,
  "aiProvider": "gemini",
  "aiApiKey": "opcional"
}
```

**Respuesta exitosa (200):**
```json
{
  "message": "Generadas 15 tarjetas desde Res-148-2023-Control-Interno.pdf",
  "count": 15
}
```

> Las tarjetas se persisten automáticamente en la tabla `learning_cards` con campos: `question`, `answer`, `difficulty` (Básico/Operativo/Experto), `category`, `source`.

**Autenticación:** Requerida.

---

### `GET /api/academy/review`

Obtiene las tarjetas pendientes de revisión y nuevas tarjetas disponibles para el usuario actual.

**Respuesta exitosa (200):**
```json
{
  "due": [
    {
      "id": "uuid-progreso",
      "next_review": "2024-12-14",
      "ease_factor": 2.5,
      "interval_days": 6,
      "learning_cards": {
        "id": "uuid-tarjeta",
        "question": "¿Qué establece la Res. 148/2023 sobre fichas de costo?",
        "answer": "Establece el formato obligatorio para la evaluación de precios...",
        "difficulty": "Operativo",
        "category": "Costos"
      }
    }
  ],
  "new": [ ... ]
}
```

**Autenticación:** Requerida.

---

### `POST /api/academy/review/[cardId]`

Registra la calificación de revisión de una tarjeta específica. Actualiza el algoritmo SM-2 (factor de facilidad, intervalo, repeticiones) y calcula el puntaje de dominio.

**Body:**
```json
{
  "score": 4
}
```

| Score | Significado |
|-------|-------------|
| 0 | Respuesta completamente incorrecta |
| 1 | Incorrecta, pero reconocida tras ver la respuesta |
| 2 | Incorrecta, pero la respuesta parecía fácil de recordar |
| 3 | Correcta con esfuerzo significativo |
| 4 | Correcta con algo de esfuerzo |
| 5 | Perfecta, sin esfuerzo |

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "result": {
    "ease_factor": 2.36,
    "interval_days": 10,
    "repetitions": 3
  },
  "newMastery": 68.5
}
```

**Autenticación:** Requerida.

---

## Sistema

### `GET /api/help-docs`

API de documentación de ayuda. Soporta búsqueda de texto, listado de estructura y lectura de archivos individuales del directorio `knowledge/`.

**Parámetros de consulta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `search` | string | Búsqueda de texto (mínimo 3 caracteres). Retorna máximo 10 resultados. |
| `path` | string | Ruta del archivo a leer (relativa a `knowledge/`) |

**Respuesta de búsqueda (200):**
```json
{
  "results": [
    {
      "path": "docs/reference/api-reference.md",
      "title": "Referencia de la API de CostPro",
      "excerpt": "...Documentación técnica completa de los endpoints REST disponibles...",
      "type": "reference"
    }
  ]
}
```

**Respuesta de listado (sin parámetros):**
```json
{
  "iso_manual": ["res-148-2023.md"],
  "docs": {
    "tutorials": ["getting-started.md"],
    "reference": ["api-reference.md"],
    "howTo": [],
    "explanation": []
  }
}
```

**Autenticación:** No requerida.

---

### `POST /api/logs`

Registra logs de error del cliente en el archivo `docs/logs/ERROR_LOGS.md`. Este endpoint nunca retorna errores 500 para no bloquear el flujo del cliente.

**Body:**
```json
{
  "context": "CostSheetEngine",
  "error": {
    "message": "Cannot read property 'total' of undefined",
    "stack": "TypeError: ...",
    "componentStack": "at CostSheet ..."
  }
}
```

**Respuesta (siempre 200):**
```json
{
  "success": true
}
```

**Autenticación:** No requerida.

---

### `GET /api/system-health`

Health check general de la plataforma. Calcula indicadores **SHI** (System Health Index) y **MRI** (Market Readiness Index) en base a auditoría de arquitectura, documentación, tests y seguridad.

**Respuesta exitosa (200):**
```json
{
  "shi": {
    "score": 93.3,
    "grade": "A",
    "infrastructure": 95,
    "operations": 90,
    "securityGRC": 98
  },
  "mri": {
    "score": 8.7,
    "grade": "A",
    "hardStops": []
  },
  "auditAlerts": 0,
  "lastAudit": "2024-12-15",
  "version": "5.8.0",
  "timestamp": "2024-12-15T14:30:00.000Z"
}
```

**Autenticación:** No requerida.

---

### `GET /api/system-health/knowledge`

Health check específico de la base de conocimiento. Verifica la disponibilidad del grafo de conocimiento, la arquitectura del sistema y el estado del pipeline de automatización.

**Respuesta exitosa (200):**
```json
{
  "knowledgeGraph": { ... },
  "systemArchitecture": { ... },
  "pipelineState": { ... },
  "timestamp": "2024-12-15T14:30:00.000Z"
}
```

**Autenticación:** No requerida.

---

### `GET /api/rss`

Consume y procesa feeds RSS configurados. Detecta automáticamente noticias prioritarias y tasas de cambio del Banco Central de Cuba. Resultados cacheados por 60 minutos.

**Respuesta exitosa (200):**
```json
{
  "items": [
    {
      "id": "article-uuid",
      "title": "Nuevo cambio en las tasas de cambio del BCC",
      "link": "https://bc.gob.cu/...",
      "pubDate": "2024-12-15T10:00:00Z",
      "contentSnippet": "El Banco Central de Cuba anuncia...",
      "feedName": "Banco Central de Cuba",
      "isPriority": true,
      "isExchangeRate": true,
      "exchangeRateData": {
        "currency": "USD",
        "value": 300.00,
        "date": "2024-12-15T10:00:00Z"
      }
    }
  ]
}
```

**Autenticación:** Opcional (recomendada para feeds configurados por usuario).

---

### `POST /api/sync/batch`

Ejecuta operaciones de sincronización por lotes con **idempotencia** garantizada. Cada operación se registra en `sync_log` con su clave de idempotencia para prevenir duplicados.

**Body:**
```json
{
  "operations": [
    {
      "idempotencyKey": "sale-INV-2024-001",
      "entity": "sale",
      "operationType": "create",
      "payload": {
        "p_store_id": "uuid-tienda",
        "p_invoice_number": "INV-2024-001",
        "p_items": [ ... ]
      }
    },
    {
      "idempotencyKey": "reception-PROV-A",
      "entity": "reception",
      "operationType": "create",
      "payload": {
        "p_store_id": "uuid-tienda",
        "p_supplier": "PROV-A",
        "p_invoice_number": "FAC-1234"
      }
    }
  ]
}
```

**Entidades soportadas:** `sale`, `reception`, `adjustment`, `transfer`.

**Respuesta exitosa (200):**
```json
{
  "results": [
    {
      "idempotencyKey": "sale-INV-2024-001",
      "status": "ok",
      "serverId": "uuid-sale-creada"
    },
    {
      "idempotencyKey": "reception-PROV-A",
      "status": "conflict",
      "error": "Duplicate entry",
      "serverData": { ... }
    }
  ]
}
```

**Autenticación:** Requerida.

---

### `POST /api/pick3/sync`

Sincroniza datos de la lotería **Pick 3** desde fuentes web y PDF. Soporta ejecución manual o vía cron (usando `CRON_SECRET` como bearer token).

**Parámetros de consulta:**

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `full` | boolean | false | Forzar sincronización completa |

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "web_count": 15,
  "pdf_count": 30,
  "timestamp": "2024-12-15T14:30:00.000Z"
}
```

**Autenticación:** Bearer token con `CRON_SECRET` o sesión de usuario.

---

## Códigos de Error

Todos los endpoints de CostPro utilizan códigos de estado HTTP estándar. Las respuestas de error incluyen un objeto con detalles:

```json
{
  "error": "Tipo de error",
  "message": "Descripción legible del problema"
}
```

| Código HTTP | Nombre | Descripción | Cuándo ocurre |
|-------------|-------|-------------|---------------|
| **400** | Bad Request | Datos inválidos o incompletos en la petición | Schema de validación fallido, campos requeridos faltantes, formato de archivo no soportado |
| **401** | Unauthorized | Sin sesión activa o token inválido | JWT expirado, sesión no encontrada, header de autorización ausente |
| **403** | Forbidden | Permisos insuficientes | Rol sin privilegios (ej. encargado intentando crear admin), perfil no encontrado |
| **404** | Not Found | Recurso no encontrado | Archivo de manual inexistente, usuario inexistente para reset de contraseña |
| **409** | Conflict | Conflicto de estado | Versión de inventario desincronizada (optimistic concurrency), operación duplicada en batch sync |
| **500** | Internal Server Error | Error interno del servidor | Fallo en motor de cálculo, error de base de datos, error inesperado |
| **502** | Bad Gateway | Error de servicio externo | Fallo de comunicación con proveedor de IA, cuota de LLM agotada |

---

## Convenciones Generales

### Formato de Request

- **POST bodies:** `application/json` (excepto `import-anexo` que usa `multipart/form-data`).
- **Parámetros de consulta:** Codificados en la URL estándar.

### Formato de Response

Las respuestas exitosas siguen uno de estos patrones:

```json
// Patrón estándar
{ "ok": true, "data": { ... } }

// Patrón con datos directamente
{ "success": true, "message": "Operación exitosa" }

// Patrón con metadata
{ "data": [...], "pagination": { ... } }
```

### Headers de Autorización

Todos los endpoints autenticados aceptan el JWT de Supabase:

```
Authorization: Bearer <token>
```

El middleware interno (`getServerSession`) lo extrae automáticamente desde cookies o desde el header, según la configuración del cliente Supabase.

### Precisión Numérica

El motor de cálculo de fichas de costo utiliza **Decimal.js** para evitar errores de punto flotante. Todas las operaciones aritméticas financieras (totales, subtotales, coeficientes) se calculan con precisión arbitraria.
