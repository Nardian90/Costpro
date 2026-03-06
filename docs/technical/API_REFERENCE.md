# API Reference — CostPro

**Base URL:** `https://<dominio>/api`
**Autenticación:** Cookie de sesión de Supabase Auth (todas las rutas requieren sesión activa excepto donde se indique)

---

## Tabla de Contenidos

- [Bot / Asistente IA](#bot--asistente-ia)
- [Fichas de Costo](#fichas-de-costo)
- [Inventario](#inventario)
- [Academia](#academia)
- [Reportes](#reportes)
- [RSS](#rss)
- [Sincronización Offline](#sincronización-offline)
- [Salud del Sistema](#salud-del-sistema)
- [Logs de Auditoría](#logs-de-auditoría)
- [Usuarios](#usuarios)
- [Códigos de Error Comunes](#códigos-de-error-comunes)

---

## Bot / Asistente IA

### `POST /api/bot/chat`

Envía un mensaje al asistente Darian y obtiene una respuesta. Soporta llamadas a herramientas del sistema.

**Request Body:**

```json
{
  "message": "string",          // Mensaje del usuario (requerido)
  "conversationHistory": [      // Historial de conversación (opcional)
    {
      "role": "user" | "model",
      "parts": [{ "text": "string" }]
    }
  ],
  "storeId": "uuid",            // ID de la tienda activa (requerido)
  "userRole": "admin" | "encargado" | "clerk" | "warehouse" | "usuario" | "costo"
}
```

**Response `200 OK`:**

```json
{
  "response": "string",         // Respuesta textual del asistente
  "toolCalls": [                // Herramientas ejecutadas (puede estar vacío)
    {
      "toolName": "string",
      "parameters": {},
      "result": {}
    }
  ],
  "provider": "gemini" | "gpt" | "qwen" | "deepseek" | "kimi"
}
```

**Response `502 Bad Gateway`:**

```json
{
  "error": "string",            // Descripción del error del proveedor LLM
  "provider": "string"
}
```

**Notas:**
- El endpoint implementa un loop de herramientas con máximo 5 iteraciones.
- Las claves de API del usuario se obtienen de la tabla `ai_api_keys` en Supabase.
- Todas las interacciones se registran en `audit_logs`.

---

## Fichas de Costo

### `POST /api/cost-sheets/calculate`

Ejecuta el motor de cálculo sobre una ficha de costo en formato JSON.

**Request Body:**

```json
{
  "ficha": {
    "meta": {
      "currency": "CUP",
      "decimals": 2,
      "allowFormulas": true,
      "maxIter": 100,
      "damping": 0.5
    },
    "rows": [
      {
        "id": "string",
        "classification": "1.1",
        "description": "Materias primas",
        "type": "COST",
        "formaCalculo": "IMPORTAR_ANEXO",
        "baseCalculo": "anexo_mp",
        "value": 0
      }
    ],
    "anexos": {
      "anexo_mp": [
        { "description": "Harina", "unit": "kg", "quantity": 10, "unitCost": 2.5 }
      ]
    },
    "rules": []
  }
}
```

**Response `200 OK`:**

```json
{
  "rows": [
    {
      "id": "string",
      "classification": "1.1",
      "description": "Materias primas",
      "calculatedValue": 25.00,
      "formula": "SUM(anexo_mp)",
      "auditTrail": ["Imported from anexo_mp: 25.00"]
    }
  ],
  "converged": true,
  "iterations": 1,
  "totalCost": 25.00
}
```

**Response `400 Bad Request`:**

```json
{
  "error": "CIRCULAR_DEPENDENCY",
  "affectedRows": ["1.3", "1.5"],
  "message": "Las filas 1.3 y 1.5 tienen dependencia circular irresoluble."
}
```

---

### `POST /api/cost-sheets/import-json`

Valida la estructura de una plantilla de ficha de costo.

**Request Body:**

```json
{
  "template": { /* FichaJSON */ }
}
```

**Response `200 OK`:**

```json
{
  "valid": true,
  "warnings": [],
  "rowCount": 15,
  "anexoCount": 3
}
```

**Response `422 Unprocessable Entity`:**

```json
{
  "valid": false,
  "errors": [
    {
      "path": "rows[2].formaCalculo",
      "message": "Valor inválido. Esperado: FIJO | IMPORTAR_ANEXO | PRORRATEO | COEFICIENTE | FORMULA"
    }
  ]
}
```

---

### `POST /api/cost-sheets/import-anexo`

Procesa archivos CSV o XLSX para generar datos de un anexo.

**Request:** `multipart/form-data`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `file` | File | Archivo CSV o XLSX |
| `anexoId` | string | ID del anexo destino |

**Response `200 OK`:**

```json
{
  "anexoId": "string",
  "rows": [
    { "description": "string", "unit": "string", "quantity": 0, "unitCost": 0 }
  ],
  "rowsImported": 12,
  "rowsSkipped": 0,
  "errors": []
}
```

---

### `POST /api/cost-sheets/export-pdf`

Genera un PDF de la ficha de costo según formato ministerial cubano.

**Request Body:**

```json
{
  "fichaId": "uuid",            // ID de la ficha guardada en Supabase
  "includeAnnexes": true,       // Incluir páginas de anexos (default: true)
  "format": "ministerial"       // Formato de salida
}
```

**Response `200 OK`:** `application/pdf` (binario)

**Response `404 Not Found`:**

```json
{
  "error": "Ficha de costo no encontrada o sin acceso."
}
```

---

## Inventario

### `POST /api/inventory/rpc`

Proxy para ejecutar RPCs de inventario de Supabase que requieren validación adicional.

**Request Body:**

```json
{
  "rpc": "perform_inventory_adjustment",
  "params": {
    "p_store_id": "uuid",
    "p_product_id": "uuid",
    "p_quantity_change": -5,
    "p_reason": "Merma por caducidad",
    "p_notes": "Lote 2024-01"
  }
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "newStock": 45,
  "movementId": "uuid"
}
```

---

## Academia

### `POST /api/academy/generate`

Genera flashcards de estudio a partir de manuales PDF usando IA.

**Request Body:**

```json
{
  "manualId": "string",         // ID del manual en Supabase Storage
  "topicsCount": 10,            // Número de tarjetas a generar (default: 10)
  "difficulty": "basic" | "intermediate" | "advanced"
}
```

**Response `200 OK`:**

```json
{
  "cards": [
    {
      "front": "¿Qué establece la Resolución 91/2020 sobre precios minoristas?",
      "back": "Establece los precios máximos de venta al público en MLC para una canasta básica de productos.",
      "tags": ["resoluciones", "precios", "normativa"],
      "difficulty": "intermediate"
    }
  ],
  "totalGenerated": 10,
  "sourceManual": "Res912020.pdf",
  "provider": "gemini"
}
```

**Response `400 Bad Request`:**

```json
{
  "error": "API_KEY_INVALID",
  "message": "La clave de API de Gemini configurada es inválida o ha expirado. Ve a Ajustes > IA para actualizarla."
}
```

---

## Reportes

### `POST /api/reports/generate`

Genera un reporte y lo almacena en Supabase Storage.

**Request Body:**

```json
{
  "type": "sales_summary" | "inventory_valuation" | "cost_analysis" | "audit_report",
  "storeId": "uuid",
  "dateFrom": "2026-01-01",
  "dateTo": "2026-03-06",
  "format": "pdf" | "excel" | "csv",
  "filters": {
    "userId": "uuid",           // Opcional: filtrar por operador
    "categoryId": "uuid"        // Opcional: filtrar por categoría
  }
}
```

**Response `200 OK`:**

```json
{
  "reportId": "uuid",
  "downloadUrl": "https://...supabase.co/storage/v1/object/reports/...",
  "expiresAt": "2026-03-06T12:00:00Z",
  "rowsIncluded": 342
}
```

**Response `503 Service Unavailable`:**

```json
{
  "error": "STORAGE_UNAVAILABLE",
  "message": "El bucket de reportes no está disponible. Contacte al administrador."
}
```

---

## RSS

### `GET /api/rss`

Obtiene las noticias más recientes de las fuentes RSS configuradas.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `priority` | `boolean` | Si `true`, solo noticias prioritarias |
| `limit` | `number` | Límite de resultados (default: 50) |
| `search` | `string` | Filtro de búsqueda |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "string",
      "description": "string",
      "link": "string",
      "pubDate": "2026-03-06T10:00:00Z",
      "source": "string",
      "isPriority": true,
      "exchangeRates": {
        "usd": 350,
        "eur": 380
      }
    }
  ],
  "total": 48,
  "lastUpdated": "2026-03-06T11:30:00Z"
}
```

---

## Sincronización Offline

### `POST /api/sync/batch`

Procesa un lote de operaciones encoladas offline. Garantiza idempotencia mediante `sync_log`.

**Request Body:**

```json
{
  "operations": [
    {
      "id": "uuid",             // ID único de la operación (para idempotencia)
      "type": "create_sale" | "register_reception" | "perform_inventory_adjustment" | "create_transfer",
      "payload": {},            // Parámetros de la operación
      "timestamp": "ISO8601",   // Timestamp de la operación offline
      "storeId": "uuid"
    }
  ]
}
```

**Response `200 OK`:**

```json
{
  "results": [
    {
      "operationId": "uuid",
      "status": "success" | "already_processed" | "conflict" | "error",
      "data": {},               // Resultado si fue exitoso
      "conflict": {             // Solo si status === "conflict"
        "local": {},
        "server": {},
        "resolvedAt": null
      }
    }
  ],
  "processedCount": 5,
  "conflictCount": 1,
  "errorCount": 0
}
```

---

## Salud del Sistema

### `GET /api/system-health`

Retorna las métricas de salud actuales del sistema.

**Response `200 OK`:**

```json
{
  "overall": 94,                // Score global 0-100
  "timestamp": "2026-03-06T11:00:00Z",
  "components": {
    "database": { "score": 98, "status": "healthy", "latencyMs": 42 },
    "storage": { "score": 100, "status": "healthy" },
    "auth": { "score": 100, "status": "healthy" },
    "ai": { "score": 85, "status": "degraded", "note": "Gemini quota near limit" }
  },
  "mri": {
    "score": 91,
    "passed": true,
    "checks": [
      { "name": "RLS Enabled on all tables", "passed": true },
      { "name": "Audit logs active", "passed": true },
      { "name": "Test coverage > 80%", "passed": false, "value": "72%" }
    ]
  }
}
```

---

## Logs de Auditoría

> Esta información está disponible directamente desde Supabase con RLS. Las API Routes de logs son un proxy con filtrado adicional.

### `GET /api/logs`

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `storeId` | `uuid` | Filtrar por tienda |
| `userId` | `uuid` | Filtrar por usuario |
| `action` | `string` | Filtrar por tipo de acción |
| `from` | `date` | Fecha de inicio |
| `to` | `date` | Fecha de fin |
| `page` | `number` | Página (default: 1) |
| `pageSize` | `number` | Resultados por página (default: 50, máx: 200) |

**Response `200 OK`:**

```json
{
  "logs": [
    {
      "id": "uuid",
      "action": "create_sale",
      "entityType": "transaction",
      "entityId": "uuid",
      "userId": "uuid",
      "userName": "string",
      "storeId": "uuid",
      "details": { "before": {}, "after": {} },
      "createdAt": "2026-03-06T10:30:00Z"
    }
  ],
  "total": 1243,
  "page": 1,
  "pageSize": 50
}
```

---

## Usuarios

### `POST /api/users/create`

Crea un nuevo usuario del sistema. Requiere rol `encargado` o `admin`.

**Request Body:**

```json
{
  "email": "string",
  "name": "string",
  "role": "clerk" | "warehouse" | "usuario" | "costo",
  "storeIds": ["uuid"],         // Tiendas a las que tendrá acceso
  "managerId": "uuid"           // ID del encargado que lo crea
}
```

**Response `201 Created`:**

```json
{
  "userId": "uuid",
  "email": "string",
  "name": "string",
  "role": "string"
}
```

**Response `403 Forbidden`:**

```json
{
  "error": "LIMIT_EXCEEDED",
  "message": "Has alcanzado el límite de usuarios permitidos (10). Contacta a tu administrador."
}
```

---

## Códigos de Error Comunes

| Código HTTP | Código de Error | Descripción |
|-------------|-----------------|-------------|
| `400` | `VALIDATION_ERROR` | Parámetros inválidos o faltantes |
| `401` | `UNAUTHORIZED` | Sesión expirada o no autenticado |
| `403` | `FORBIDDEN` | Rol insuficiente para la operación |
| `403` | `LIMIT_EXCEEDED` | Límite de negocio alcanzado |
| `404` | `NOT_FOUND` | Recurso no encontrado o sin acceso (RLS) |
| `409` | `CONFLICT` | Conflicto de datos (duplicado, concurrencia) |
| `422` | `INVALID_DATA` | Datos semánticamente inválidos |
| `429` | `RATE_LIMITED` | Límite de cuota del proveedor LLM |
| `500` | `INTERNAL_ERROR` | Error interno del servidor |
| `502` | `PROVIDER_ERROR` | Error del proveedor LLM externo |
| `503` | `SERVICE_UNAVAILABLE` | Servicio dependiente no disponible |

---

## Notas de Seguridad

1. **RLS en todos los endpoints:** Las consultas a Supabase se ejecutan con las credenciales del usuario autenticado. Las políticas RLS garantizan que el usuario solo acceda a datos de sus tiendas.

2. **Validación de entrada:** Todos los endpoints validan parámetros con schemas Zod antes de procesarlos.

3. **RBAC en herramientas de IA:** El endpoint `/api/bot/chat` verifica los permisos del usuario antes de ejecutar cualquier herramienta.

4. **Idempotencia en sync:** El endpoint `/api/sync/batch` usa `sync_log` para garantizar que cada operación se procese exactamente una vez.
