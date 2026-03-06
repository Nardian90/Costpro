# Schema de Base de Datos — CostPro

**Motor:** PostgreSQL 15 (Supabase)
**Migraciones:** `supabase/migrations/` (99 archivos SQL versionados)
**Seguridad:** Row-Level Security habilitada en todas las tablas de negocio

---

## Tabla de Contenidos

- [Convenciones](#convenciones)
- [Módulo de Identidad](#módulo-de-identidad)
- [Módulo de Tiendas y Multi-Tenant](#módulo-de-tiendas-y-multi-tenant)
- [Módulo de Catálogo](#módulo-de-catálogo)
- [Módulo de Inventario](#módulo-de-inventario)
- [Módulo de Ventas (POS)](#módulo-de-ventas-pos)
- [Módulo de Recepciones](#módulo-de-recepciones)
- [Módulo de Transferencias](#módulo-de-transferencias)
- [Módulo de Caja](#módulo-de-caja)
- [Módulo de Fichas de Costo](#módulo-de-fichas-de-costo)
- [Módulo de IA y Bot](#módulo-de-ia-y-bot)
- [Módulo de Academia](#módulo-de-academia)
- [Módulo de Noticias RSS](#módulo-de-noticias-rss)
- [Infraestructura del Sistema](#infraestructura-del-sistema)
- [Funciones y RPCs](#funciones-y-rpcs)
- [Triggers](#triggers)
- [Índices Clave](#índices-clave)

---

## Convenciones

- **PK:** `id UUID DEFAULT gen_random_uuid()` en todas las tablas
- **Timestamps:** `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ`
- **Multi-tenant:** `store_id UUID NOT NULL REFERENCES stores(id)` en tablas de negocio
- **Soft delete:** `is_deleted BOOLEAN DEFAULT FALSE` donde aplica
- **JSONB:** Para datos estructurados variables (detalles de auditoría, configuraciones)
- **Enums:** Definidos como tipos PostgreSQL (`user_role`, `transfer_status`, etc.)

---

## Módulo de Identidad

### `auth.users` (Supabase managed)

Tabla gestionada por Supabase Auth. No modificar directamente.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | PK — referenciado desde `profiles` |
| `email` | TEXT | Email de acceso |
| `created_at` | TIMESTAMPTZ | Fecha de registro |

---

### `public.profiles`

Extiende `auth.users` con datos de negocio del usuario.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK = `auth.users.id` |
| `email` | TEXT | No | Email del usuario |
| `name` | TEXT | Sí | Nombre completo |
| `role` | `user_role` | No | Rol global del usuario |
| `active_store_id` | UUID | Sí | Tienda activa actual |
| `ai_provider` | TEXT | Sí | Proveedor LLM preferido |
| `max_stores_limit` | INT | No | Límite de tiendas (encargados) |
| `max_users_limit` | INT | No | Límite de usuarios (encargados) |
| `created_at` | TIMESTAMPTZ | No | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Sí | Última actualización |

**Tipo `user_role`:**
```sql
CREATE TYPE user_role AS ENUM (
  'admin', 'encargado', 'manager', 'clerk', 'warehouse', 'usuario', 'costo'
);
```

**RLS:** Solo el propio usuario y encargados/admins de su tienda pueden leer. Solo el admin puede cambiar el rol global.

---

## Módulo de Tiendas y Multi-Tenant

### `public.stores`

Tiendas o sucursales del negocio.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `name` | TEXT | No | Nombre de la tienda |
| `address` | TEXT | Sí | Dirección física |
| `phone` | TEXT | Sí | Teléfono de contacto |
| `owner_id` | UUID | No | FK → `profiles.id` (encargado propietario) |
| `is_active` | BOOLEAN | No | Estado de la tienda |
| `settings` | JSONB | Sí | Configuración personalizada |
| `created_at` | TIMESTAMPTZ | No | Fecha de creación |

**RLS:** Solo el owner y admin pueden ver/modificar.

---

### `public.user_store_memberships`

Asignación de usuarios a tiendas con rol específico por tienda.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → `profiles.id` |
| `store_id` | UUID | No | FK → `stores.id` |
| `role` | `user_role` | No | Rol en esta tienda específica |
| `status` | TEXT | No | `'active'` \| `'inactive'` |
| `created_at` | TIMESTAMPTZ | No | Fecha de asignación |

**Índice único:** `(user_id, store_id)` — un usuario tiene un solo rol por tienda.

**RLS:** Los encargados ven solo membresías de sus tiendas; admin ve todo.

---

## Módulo de Catálogo

### `public.products`

Catálogo maestro de productos.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `sku` | TEXT | No | Código del producto (único por tienda) |
| `name` | TEXT | No | Nombre del producto |
| `description` | TEXT | Sí | Descripción larga |
| `category` | TEXT | Sí | Categoría |
| `unit` | TEXT | No | Unidad de medida (kg, un, lt, etc.) |
| `cost_price` | DECIMAL(12,4) | No | Precio de costo |
| `sale_price` | DECIMAL(12,4) | No | Precio de venta |
| `is_active` | BOOLEAN | No | Si está disponible para venta |
| `image_url` | TEXT | Sí | URL de imagen (Supabase Storage) |
| `barcode` | TEXT | Sí | Código de barras EAN/UPC |
| `created_at` | TIMESTAMPTZ | No | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Sí | Última modificación |

**Índice único:** `(store_id, sku)` — aislamiento de SKU por tienda.

**RLS:** Solo miembros activos de la tienda pueden leer. Rol `encargado`+ puede modificar.

---

## Módulo de Inventario

### `public.inventory`

Stock actual por producto y tienda.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `product_id` | UUID | No | FK → `products.id` |
| `quantity` | DECIMAL(12,4) | No | Stock actual |
| `min_stock` | DECIMAL(12,4) | Sí | Stock mínimo (alerta) |
| `updated_at` | TIMESTAMPTZ | No | Última actualización de stock |

**Índice único:** `(store_id, product_id)` — un registro por producto y tienda.

---

### `public.stock_movements`

Historial de todos los movimientos de inventario.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `product_id` | UUID | No | FK → `products.id` |
| `movement_type` | TEXT | No | `'sale'` \| `'reception'` \| `'adjustment'` \| `'transfer_in'` \| `'transfer_out'` |
| `quantity_change` | DECIMAL(12,4) | No | Cambio (positivo = entrada, negativo = salida) |
| `quantity_before` | DECIMAL(12,4) | No | Stock antes del movimiento |
| `quantity_after` | DECIMAL(12,4) | No | Stock después del movimiento |
| `reference_id` | UUID | Sí | ID del documento origen (venta, recepción, etc.) |
| `reason` | TEXT | Sí | Motivo (para ajustes) |
| `created_by` | UUID | No | FK → `profiles.id` |
| `created_at` | TIMESTAMPTZ | No | Timestamp del movimiento |

---

## Módulo de Ventas (POS)

### `public.transactions`

Cabecera de ventas.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `cashier_id` | UUID | No | FK → `profiles.id` |
| `total` | DECIMAL(12,2) | No | Total de la venta |
| `discount` | DECIMAL(12,2) | No | Descuento aplicado |
| `final_total` | DECIMAL(12,2) | No | Total final (total - discount) |
| `payment_method` | TEXT | No | `'cash'` \| `'card'` \| `'transfer'` |
| `status` | TEXT | No | `'completed'` \| `'voided'` |
| `notes` | TEXT | Sí | Notas de la transacción |
| `created_at` | TIMESTAMPTZ | No | Fecha y hora de la venta |

---

### `public.transaction_items`

Líneas de venta.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `transaction_id` | UUID | No | FK → `transactions.id` |
| `product_id` | UUID | No | FK → `products.id` |
| `product_name` | TEXT | No | Nombre al momento de la venta (snapshot) |
| `quantity` | DECIMAL(12,4) | No | Cantidad vendida |
| `unit_price` | DECIMAL(12,4) | No | Precio unitario al momento |
| `discount` | DECIMAL(12,2) | No | Descuento por ítem |
| `subtotal` | DECIMAL(12,2) | No | Subtotal de la línea |

---

## Módulo de Recepciones

### `public.receptions`

Cabecera de entrada de mercancía.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `received_by` | UUID | No | FK → `profiles.id` |
| `supplier` | TEXT | Sí | Proveedor |
| `invoice_number` | TEXT | Sí | Número de factura |
| `total_cost` | DECIMAL(12,2) | No | Costo total de la recepción |
| `status` | TEXT | No | `'pending'` \| `'confirmed'` |
| `notes` | TEXT | Sí | Notas |
| `received_at` | TIMESTAMPTZ | No | Fecha de recepción |
| `created_at` | TIMESTAMPTZ | No | Fecha de registro |

---

### `public.reception_items`

Líneas de recepción.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `reception_id` | UUID | No | FK → `receptions.id` |
| `product_id` | UUID | No | FK → `products.id` |
| `quantity` | DECIMAL(12,4) | No | Cantidad recibida |
| `unit_cost` | DECIMAL(12,4) | No | Costo unitario |
| `subtotal` | DECIMAL(12,2) | No | Subtotal de la línea |

---

## Módulo de Transferencias

### `public.transfers`

Traslados de stock entre almacenes.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `from_store_id` | UUID | No | FK → `stores.id` (origen) |
| `to_store_id` | UUID | No | FK → `stores.id` (destino) |
| `requested_by` | UUID | No | FK → `profiles.id` |
| `confirmed_by` | UUID | Sí | FK → `profiles.id` |
| `status` | `transfer_status` | No | `'pending'` \| `'confirmed'` \| `'cancelled'` |
| `notes` | TEXT | Sí | Notas de la transferencia |
| `requested_at` | TIMESTAMPTZ | No | Fecha de solicitud |
| `confirmed_at` | TIMESTAMPTZ | Sí | Fecha de confirmación |

---

### `public.transfer_items`

Líneas de transferencia.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `transfer_id` | UUID | No | FK → `transfers.id` |
| `product_id` | UUID | No | FK → `products.id` |
| `product_name` | TEXT | No | Snapshot del nombre |
| `quantity` | DECIMAL(12,4) | No | Cantidad transferida |
| `unit_price` | DECIMAL(12,4) | No | Precio de referencia al momento |

---

## Módulo de Caja

### `public.cash_closures`

Registros de cierre de caja.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `cashier_id` | UUID | No | FK → `profiles.id` |
| `manager_id` | UUID | Sí | FK → `profiles.id` (quien valida) |
| `status` | TEXT | No | `'pending'` \| `'closed'` |
| `expected_cash` | DECIMAL(12,2) | No | Efectivo esperado según sistema |
| `declared_cash` | DECIMAL(12,2) | No | Efectivo declarado por cajero |
| `difference` | DECIMAL(12,2) | No | Diferencia (declared - expected) |
| `sales_count` | INT | No | Número de ventas en el período |
| `sales_total` | DECIMAL(12,2) | No | Total de ventas en el período |
| `notes` | TEXT | Sí | Notas del cierre |
| `period_from` | TIMESTAMPTZ | No | Inicio del período |
| `period_to` | TIMESTAMPTZ | Sí | Fin del período |
| `created_at` | TIMESTAMPTZ | No | Fecha de creación |

---

## Módulo de Fichas de Costo

### `public.cost_sheets`

Fichas de costo guardadas.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `created_by` | UUID | No | FK → `profiles.id` |
| `name` | TEXT | No | Nombre de la ficha |
| `product_name` | TEXT | No | Producto al que aplica |
| `template_type` | TEXT | Sí | Tipo de plantilla base |
| `data` | JSONB | No | JSON completo de la ficha (FichaJSON) |
| `status` | TEXT | No | `'draft'` \| `'approved'` \| `'archived'` |
| `version` | INT | No | Versión (incrementa en cada guardado) |
| `created_at` | TIMESTAMPTZ | No | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Sí | Última modificación |

---

## Módulo de IA y Bot

### `public.ai_api_keys`

Claves de API de proveedores LLM por usuario.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → `profiles.id` |
| `provider` | TEXT | No | `'gemini'` \| `'openai'` \| `'qwen'` \| `'deepseek'` \| `'kimi'` |
| `api_key` | TEXT | No | Clave de API (almacenada encriptada) |
| `is_active` | BOOLEAN | No | Si está activa |
| `created_at` | TIMESTAMPTZ | No | Fecha de registro |

**Índice único:** `(user_id, provider)`

**RLS:** Solo el propio usuario puede ver sus claves. Nunca se exponen en la API pública.

---

## Módulo de Academia

### `public.academy_cards`

Flashcards del sistema de capacitación.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `user_id` | UUID | No | FK → `profiles.id` |
| `front` | TEXT | No | Pregunta / frente de la tarjeta |
| `back` | TEXT | No | Respuesta / reverso de la tarjeta |
| `tags` | TEXT[] | Sí | Etiquetas de clasificación |
| `source_manual` | TEXT | Sí | Manual PDF origen |
| `easiness` | DECIMAL(4,2) | No | Factor SM-2 (default: 2.5) |
| `interval` | INT | No | Intervalo SM-2 en días |
| `repetitions` | INT | No | Número de repeticiones |
| `next_review` | DATE | No | Próxima fecha de repaso |
| `created_at` | TIMESTAMPTZ | No | Fecha de creación |

---

## Módulo de Noticias RSS

### `public.rss_feeds`

Fuentes RSS configuradas.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | No | FK → `stores.id` |
| `name` | TEXT | No | Nombre de la fuente |
| `url` | TEXT | No | URL del feed RSS |
| `category` | TEXT | Sí | Categoría |
| `is_priority` | BOOLEAN | No | Si se marca como prioritaria |
| `is_active` | BOOLEAN | No | Si está activa |
| `last_fetched` | TIMESTAMPTZ | Sí | Última vez que se descargó |
| `created_at` | TIMESTAMPTZ | No | Fecha de registro |

---

### `public.rss_items`

Noticias descargadas de feeds RSS.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `feed_id` | UUID | No | FK → `rss_feeds.id` |
| `title` | TEXT | No | Título de la noticia |
| `description` | TEXT | Sí | Resumen |
| `link` | TEXT | No | URL original (único por feed) |
| `pub_date` | TIMESTAMPTZ | Sí | Fecha de publicación |
| `is_priority` | BOOLEAN | No | Detectado como prioritario |
| `exchange_rates` | JSONB | Sí | Tasas de cambio detectadas |
| `created_at` | TIMESTAMPTZ | No | Fecha de inserción |

---

## Infraestructura del Sistema

### `public.audit_logs`

Log central de auditoría de todas las operaciones.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK |
| `store_id` | UUID | Sí | FK → `stores.id` |
| `user_id` | UUID | Sí | FK → `profiles.id` |
| `action` | TEXT | No | Tipo de acción (ej: `create_sale`, `adjust_stock`) |
| `entity_type` | TEXT | Sí | Tipo de entidad (ej: `transaction`, `product`) |
| `entity_id` | TEXT | Sí | ID del objeto afectado |
| `details` | JSONB | Sí | Diferencias `{ before: {}, after: {} }` |
| `ip_address` | TEXT | Sí | IP del cliente |
| `user_agent` | TEXT | Sí | User-Agent del cliente |
| `created_at` | TIMESTAMPTZ | No | Timestamp de la acción |

**Particionado:** Se recomienda particionar por `created_at` (mensual) cuando supere 1M de registros.

---

### `public.sync_log`

Registro de sincronización offline para garantizar idempotencia.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | No | PK = ID de la operación offline |
| `operation_type` | TEXT | No | Tipo de operación |
| `store_id` | UUID | No | FK → `stores.id` |
| `user_id` | UUID | No | FK → `profiles.id` |
| `payload` | JSONB | No | Parámetros de la operación |
| `result` | JSONB | Sí | Resultado de la ejecución |
| `status` | TEXT | No | `'processed'` \| `'failed'` |
| `processed_at` | TIMESTAMPTZ | No | Timestamp de procesamiento |

**Índice:** `(id)` — consulta O(1) para verificar idempotencia.

---

## Funciones y RPCs

### Funciones de Seguridad

```sql
-- Obtiene la tienda activa del usuario autenticado
get_active_store_id() → UUID

-- Verifica si el usuario tiene un rol
has_role(p_user_id UUID, p_role user_role) → BOOLEAN

-- Verificación de propiedad de tienda
is_store_owner(p_store_id UUID) → BOOLEAN
```

### RPCs de Negocio

```sql
-- POS: Registra una venta completa
create_sale(
  p_store_id UUID,
  p_items JSONB,              -- [{product_id, quantity, unit_price, discount}]
  p_payment_method TEXT,
  p_discount DECIMAL,
  p_notes TEXT
) → JSONB                     -- { sale_id, receipt_id }

-- Inventario: Recepción de mercancía
register_reception(
  p_store_id UUID,
  p_supplier TEXT,
  p_invoice_number TEXT,
  p_items JSONB               -- [{product_id, quantity, unit_cost}]
) → JSONB

-- Inventario: Ajuste manual
perform_inventory_adjustment(
  p_store_id UUID,
  p_product_id UUID,
  p_quantity_change DECIMAL,
  p_reason TEXT,
  p_notes TEXT
) → JSONB

-- Transferencia: Confirmar traslado
confirm_transfer(
  p_transfer_id UUID,
  p_confirmed_by UUID
) → JSONB

-- Catálogo: Actualización masiva
bulk_update_products(
  p_store_id UUID,
  p_products JSONB            -- [{id, sale_price, cost_price, is_active, ...}]
) → JSONB

-- POS: Catálogo optimizado para TPV
get_products_for_pos(
  p_store_id UUID,
  p_search TEXT,
  p_category TEXT
) → TABLE(id, name, sku, sale_price, quantity, category, barcode, image_url)

-- Caja: Ventas desde último cierre
get_sales_since_last_closure(
  p_store_id UUID
) → TABLE(total_sales, sales_count, last_closure_at)

-- Usuarios: Creación gestionada
managed_create_user(
  p_manager_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_role user_role,
  p_store_ids UUID[]
) → JSONB
```

---

## Triggers

| Trigger | Tabla | Evento | Propósito |
|---------|-------|--------|-----------|
| `trg_audit_products` | `products` | UPDATE | Registra cambios de precio en `audit_logs` |
| `trg_audit_profiles` | `profiles` | UPDATE | Registra cambios de rol en `audit_logs` |
| `trg_audit_stores` | `stores` | UPDATE | Registra cambios de configuración |
| `trg_update_inventory` | `stock_movements` | INSERT | Actualiza `inventory.quantity` automáticamente |
| `trg_validate_active_store` | `profiles` | INSERT/UPDATE | Valida que `active_store_id` tenga membresía activa |
| `trg_count_user_stores` | `user_store_memberships` | INSERT/DELETE | Actualiza contador de tiendas del encargado |

---

## Índices Clave

```sql
-- Búsqueda de productos por tienda (POS)
CREATE INDEX idx_products_store_active ON products(store_id, is_active);
CREATE INDEX idx_products_store_sku ON products(store_id, sku);

-- Inventario por tienda y producto
CREATE UNIQUE INDEX idx_inventory_store_product ON inventory(store_id, product_id);

-- Historial de movimientos por producto
CREATE INDEX idx_stock_movements_product ON stock_movements(store_id, product_id, created_at DESC);

-- Transacciones por fecha
CREATE INDEX idx_transactions_store_date ON transactions(store_id, created_at DESC);

-- Auditoría por acción y entidad
CREATE INDEX idx_audit_logs_action ON audit_logs(store_id, action, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Membresías activas de usuario
CREATE INDEX idx_memberships_user ON user_store_memberships(user_id, status);
```

---

## Aplicar Migraciones

```bash
# Vincular con proyecto Supabase
supabase link --project-ref <project-ref>

# Ver estado de migraciones
supabase db diff

# Aplicar todas las migraciones pendientes
supabase db push

# Crear nueva migración
supabase migration new <nombre_descriptivo>
```

> **Importante:** Las migraciones son irreversibles en producción. Siempre crear una nueva migración en lugar de modificar una existente.
