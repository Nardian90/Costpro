# 🔍 AUDITORÍA COMPLETA - VISTA ALMACÉN
**Fecha:** 12 de Enero, 2025  
**Auditor:** Arquitecto Senior Full-Stack  
**Proyecto:** Costpro - Sistema POS + Inventario  
**Stack:** Next.js + TypeScript + Supabase + Tailwind CSS  

---

## 📋 TABLA DE CONTENIDOS
1. [Hallazgos Críticos](#hallazgos-críticos)
2. [Hallazgos de Seguridad](#hallazgos-de-seguridad)
3. [Hallazgos de UX](#hallazgos-de-ux)
4. [Hallazgos de Código](#hallazgos-de-código)
5. [Inconsistencias de Negocio](#inconsistencias-de-negocio)
6. [Recomendaciones](#recomendaciones)
7. [Evaluación Final](#evaluación-final)

---

## ❌ HALLAZGOS CRÍTICOS

### 1. **Recepción SIN Captura de Campos Obligatorios** 🔴
**Severidad:** CRÍTICA  
**Ubicación:** `src/components/WarehouseView.tsx` líneas 181-228

**Problema:**
- El formulario de recepción **NO captura**:
  - ❌ **Fecha de Recepción** (campo vacío)
  - ❌ **Proveedor** (campo vacío)
  - ❌ **Número de Factura** (campo vacío)
- El viejo código (old project) SÍ captura estos campos en RPC
- La tabla `receptions` espera estos datos obligatorios
- **Impacto de Negocio:** Imposible auditar origen de compras, violar requisitos fiscales

**Código Actual (Déficit):**
```tsx
const processReception = async () => {
    // NO CAPTURA FECHAS, PROVEEDOR, FACTURA
    const updates = Array.from(receptionItems.values()).map(async ({ product, quantityToAdd, newCost }) => {
        // Solo actualiza inventory y products
        // Falta registro completo en receptions y reception_items
```

---

### 2. **Error 403 RLS en Tabla `inventory`** 🔴
**Severidad:** CRÍTICA  
**Ubicación:** Backend (Supabase RLS policies)

**Problema:**
- Tabla `inventory` tiene RLS habilitado ✓ (correcto)
- **PERO** el componente intenta actualizar directamente con `upsert`:
```tsx
const { error } = await supabase
    .from('inventory')
    .upsert({ store_id: user.store_id, product_id: product.id, quantity: newTotalStock, ... })
```
- RLS bloquea porque:
  - No existe RPC con `SECURITY DEFINER`
  - El cliente intenta escribir directamente (prohibited)
  - **Solución:** RPC con `SECURITY DEFINER` (`register_reception`)

**Código Actual (VULNERABLE):**
```typescript
// ❌ DIRECTO A TABLA RLS - GENERARÁ 403
await supabase.from('inventory').upsert({ ... })
```

---

### 3. **Inconsistencia de Datos: Tabla `stock_movements` NO usada** 🔴
**Severidad:** CRÍTICA  
**Ubicación:** `src/components/WarehouseView.tsx` línea 114-125

**Problema:**
- El código Lee `stock_movements` para "Recepciones Recientes" ✓
- **PERO** `processReception()` NO escribe en `stock_movements` directamente
- El viejo RPC (`fn_process_receipt`) sí escribe un registro de auditoría completo
- **Impacto:** Auditoría incompleta, inconsistencia entre tablas

---

### 4. **Arquitectura No Atómica: Transacciones Sin Garantía** 🔴
**Severidad:** CRÍTICA  
**Ubicación:** `src/components/WarehouseView.tsx` líneas 189-228

**Problema:**
```tsx
const updates = Array.from(receptionItems.values()).map(async ({ product, ... }) => {
    const { error: invError } = await supabase.from('inventory').upsert({...})
    if (invError) throw invError;
    
    // Si falla aquí, inventory ya fue actualizado pero products no
    await supabase.from('products').update({ cost_price: newCost }).eq('id', product.id);
    
    // Si falla aquí, ambas tablas cambiaron pero no hay registro en stock_movements
    await logStockMovement(...)
});
await Promise.all(updates);
```

**Riesgos:**
- ❌ Si `products` falla, `inventory` ya cambió (inconsistencia)
- ❌ Si `logStockMovement` falla, no hay auditoría
- ❌ Sin garantía ACID: race conditions posibles

**Solución:** RPC atómica con transacción SQL

---

## 🔒 HALLAZGOS DE SEGURIDAD

### 1. **Row Level Security (RLS) Bypassable** 🟠
**Severidad:** ALTA  
**Ubicación:** Intento de upsert en tabla `inventory` con RLS

**Problema:**
- El cliente escribe directamente = bypass de RLS
- Aunque hayamos autenticado el usuario, no garantiza que `store_id` sea el correcto
- Usuario podría manipular `store_id` en request

**Solución:**
- RPC con `SECURITY DEFINER` que:
  - Valida sesión del usuario (`auth.uid()`)
  - Valida que `store_id` pertenezca al usuario
  - Ejecuta como propietario de tabla, no como usuario

---

### 2. **No Existe Validación de Permisos por Rol** 🟠
**Severidad:** MEDIA  
**Ubicación:** `src/components/WarehouseView.tsx` línea 21

**Problema:**
```tsx
export default function WarehouseView() {
    const user = useAuthStore((state) => state.user);
    // ❌ No valida si user.role === 'warehouse' o 'manager' o 'admin'
    // ❌ Cualquier usuario autenticado puede acceder
```

**Tipo de Interfaz:**
```typescript
export type UserRole = 'admin' | 'manager' | 'clerk' | 'warehouse';
```

**Existe Sistema de Permisos:**
```typescript
export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  warehouse: { canReceiveProducts: true, ... },
  clerk: { canReceiveProducts: false, ... },
  // ... otros roles
```

**Recomendación:**
```tsx
// ❌ ACTUAL: Nada
const user = useAuthStore((state) => state.user);

// ✅ CORRECTO:
const { canReceiveProducts } = ROLE_PERMISSIONS[user?.role || 'clerk'];
if (!canReceiveProducts) {
    return <div>Acceso denegado</div>;
}
```

---

### 3. **Imágenes: Sin Validación de Tamaño en Frontend** 🟡
**Severidad:** BAJA (mitigado en old project)  
**Ubicación:** `src/components/WarehouseView.tsx`

**Problema:**
- No existe validación de tamaño de archivo (2MB máximo recomendado)
- Old project SÍ tiene esta validación:
```javascript
if (file.size > 2 * 1024 * 1024) {
    Swal.fire('Error', 'La imagen no debe superar 2MB', 'error');
```

---

## 🎨 HALLAZGOS DE UX

### 1. **Modal de Recepción: Interfaz Incompleta** 🟠
**Severidad:** MEDIA  
**Ubicación:** Falta de panel de captura de detalles

**Problema:**
- Old project muestra **sección expandible** para capturar:
  - Proveedor (required)
  - Fecha (required)
  - Número de Factura (required)
- **Nuevo proyecto:** No existe esta sección

**Comparativo:**
```javascript
// OLD PROJECT - tiene esto ✅
<div id="receipt-meta-section" style="display:none;">
    <label>Proveedor <span style="color:red">*</span></label>
    <input id="receipt-meta-supplier" placeholder="Nombre del Proveedor" />
    
    <label>Fecha Recepción <span style="color:red">*</span></label>
    <input type="date" id="receipt-meta-date" />
    
    <label>Ref. / Factura <span style="color:red">*</span></label>
    <input id="receipt-meta-ref" placeholder="FAC-001" />
</div>

// NUEVO PROYECTO - NO TIENE ESTO ❌
// panel de recepción vacío de estos campos
```

---

### 2. **Formulario de Recepción: Sin Validaciones** 🟠
**Severidad:** MEDIA

**Problemas:**
- ❌ No valida que recepción no esté vacía
- ❌ No valida cantidad > 0
- ❌ No valida campos obligatorios
- ❌ Sin confirmación de peligro antes de guardar

**Comparativo (Old Project):**
```javascript
// OLD PROJECT - Validación completa ✓
if (!supplier || !ref) 
    return Swal.fire('Error', 'Faltan detalles de recepción', 'error');

if (this.receiptItems.length === 0) 
    return Swal.fire('Error', 'Lista vacía', 'error');

// NUEVO PROYECTO - Sin validaciones ❌
const processReception = async () => {
    if (receptionItems.size === 0) return;  // Silencioso
    // Sin validar campos
```

---

### 3. **Imágenes: Fallback Incompleto** 🟡
**Severidad:** BAJA

**Problema:**
- Si imagen falla, muestra icono `<Package />` genérico
- **Mejor UX:** Mostrar "producto sin imagen" + permitir subir desde aquí

---

## 💻 HALLAZGOS DE CÓDIGO

### 1. **Duplicación de Lógica: `logStockMovement` No Integrada** 🟠
**Severidad:** MEDIA  
**Ubicación:** `src/components/WarehouseView.tsx` líneas 126-145

**Problema:**
```tsx
const logStockMovement = async (productId, quantityChange, type, notes) => {
    // Función desacoplada que intenta insertar en stock_movements
    // PERO no está integrada en flujo de recepción atómico
}
```

**Issue:** 
- Esta función puede fallar silenciosamente
- No forma parte de transacción RPC
- Código legacy (old project) integra esto en RPC

---

### 2. **Estados Innecesarios y Confusos** 🟡
**Severidad:** BAJA

**Problema:**
```tsx
const [recentReceptions, setRecentReceptions] = useState<any[]>([]);
const [isSessionChecking, setIsSessionChecking] = useState(true);
```

- `recentReceptions` se carga pero panel está oculto en modo recepción
- `isSessionChecking` es overhead innecesario (Supabase maneja esto)

---

### 3. **TypeScript: Tipos Incompletos** 🟡
**Severidad:** BAJA

**Problema:**
```tsx
const [recentReceptions, setRecentReceptions] = useState<any[]>([]);
// ❌ 'any' es anti-patrón TypeScript

// ✅ Debería ser:
const [recentReceptions, setRecentReceptions] = useState<StockMovement[]>([]);
```

---

### 4. **Manejo de Errores Incompleto** 🟠
**Severidad:** MEDIA

**Problema:**
```tsx
try {
    const { error } = await supabase.from('inventory').upsert({...});
    if (error) throw error;
} catch (error) {
    toast.error('Error al actualizar stock');
    fetchProducts();  // ❌ Recargar todo es costoso
}
```

**Issues:**
- `fetchProducts()` es sledgehammer (reload completo)
- No diferencia entre errores RLS, validación, red, etc.
- No registra error para debugging

---

## 🏢 INCONSISTENCIAS DE NEGOCIO

### 1. **Tabla `receptions` Nunca Usado** 🔴
**Severidad:** CRÍTICA

**Problema:**
- Tipos TypeScript definen interfaz `Receipt`:
```typescript
export interface Receipt {
  id: string;
  created_at: string;
  user_id: string | null;
  status: 'active' | 'voided';
  total_cost: number;
  reference_doc: string | null;
  notes: string | null;
}
```

- **PERO** componente jamás escribe en tabla `receptions`
- Viejo proyecto SÍ usa `fn_process_receipt` RPC que escribe aquí
- **Impacto:** Imposible rastrear recepciones, violar auditoría fiscal

---

### 2. **Tabla `reception_items` Nunca Usado** 🔴
**Severidad:** CRÍTICA

**Problema:**
- Tipo define `ReceiptItem`, pero jamás se inserta
- Viejo proyecto escribe aquí mediante RPC
- **Impacto:** Pérdida de auditoría detallada de qué se recibió cuándo

---

### 3. **Inconsistencia entre Inventario y Movimientos** 🔴
**Severidad:** CRÍTICA

**Problema:**
```
OLD PROJECT:
  inventory (READ-ONLY) ← stock_movements (INSERT via RPC) ← receptions + reception_items

NUEVO PROYECTO:
  inventory (DIRECT UPSERT) ← NO se registra en receptions/reception_items
  stock_movements (INTENTO de INSERT pero sin RPC atómico)
```

**Resultado:** Bases de datos inconsistentes si hay fallo a mitad del proceso

---

### 4. **Flujo de Negocio Incompleto** 🟠
**Severidad:** MEDIA

**Problema:**
- No existe captura de **proveedores como entidad**
- Proveedores se guardan como string en campo `supplier` (desnormalizado)
- **Mejor arquitectura:**
```sql
CREATE TABLE suppliers (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE,
  contact_info TEXT,
  created_at TIMESTAMP
);

ALTER TABLE products ADD supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE receptions ADD supplier_id UUID REFERENCES suppliers(id);
```

---

## ✅ RECOMENDACIONES

### 1. **INMEDIATAS (Bloqueantes)**

#### A. Crear RPC `register_reception` con SECURITY DEFINER
```sql
CREATE OR REPLACE FUNCTION register_reception(
    p_store_id UUID,
    p_supplier TEXT,
    p_reception_date DATE,
    p_invoice_number TEXT,
    p_items JSONB,  -- [{product_id, quantity, unit_cost}, ...]
    p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reception_id UUID;
    v_item JSONB;
BEGIN
    -- Validaciones
    IF p_supplier IS NULL OR p_supplier = '' THEN
        RAISE EXCEPTION 'Supplier is required';
    END IF;
    IF p_invoice_number IS NULL OR p_invoice_number = '' THEN
        RAISE EXCEPTION 'Invoice number is required';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Reception must have at least one item';
    END IF;

    -- Iniciar transacción (automático en plpgsql)
    
    -- 1. Insertar cabecera en receptions
    INSERT INTO receptions (store_id, supplier, reception_date, invoice_number, user_id, total_cost)
    VALUES (p_store_id, p_supplier, p_reception_date, p_invoice_number, p_user_id, 0)
    RETURNING id INTO v_reception_id;

    -- 2. Para cada item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- 2a. Insertar en reception_items
        INSERT INTO reception_items (reception_id, product_id, quantity, unit_cost)
        VALUES (
            v_reception_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::NUMERIC,
            (v_item->>'unit_cost')::NUMERIC
        );

        -- 2b. Actualizar inventory
        INSERT INTO inventory (store_id, product_id, quantity, updated_at)
        VALUES (
            p_store_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::NUMERIC,
            NOW()
        )
        ON CONFLICT (store_id, product_id) DO UPDATE SET
            quantity = inventory.quantity + (v_item->>'quantity')::NUMERIC,
            updated_at = NOW();

        -- 2c. Registrar en stock_movements (auditoría)
        INSERT INTO stock_movements (
            store_id, product_id, quantity_change, movement_type,
            reference_id, movement_date, created_by, created_at
        ) VALUES (
            p_store_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::NUMERIC,
            'purchase',
            v_reception_id::TEXT,
            NOW(),
            p_user_id,
            NOW()
        );
    END LOOP;

    -- 3. Actualizar receptions con total_cost
    UPDATE receptions SET total_cost = (
        SELECT SUM(quantity * unit_cost) FROM reception_items WHERE reception_id = v_reception_id
    ) WHERE id = v_reception_id;

    RETURN v_reception_id;
END;
$$;

-- Permisos RLS
ALTER TABLE receptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY receptions_store_policy ON receptions
    USING (store_id = (SELECT store_id FROM users WHERE id = auth.uid()));
```

#### B. Actualizar Frontend para llamar RPC
```tsx
const processReception = async () => {
    if (!metaDetails.supplier || !metaDetails.invoiceNumber || !metaDetails.date) {
        toast.error('Complete los detalles de recepción');
        return;
    }
    if (receptionItems.size === 0) {
        toast.error('Agregue al menos un producto');
        return;
    }

    const items = Array.from(receptionItems.values()).map(({ product, quantityToAdd, newCost }) => ({
        product_id: product.id,
        quantity: quantityToAdd,
        unit_cost: newCost
    }));

    try {
        const { data, error } = await supabase.rpc('register_reception', {
            p_store_id: user.store_id,
            p_supplier: metaDetails.supplier,
            p_reception_date: metaDetails.date,
            p_invoice_number: metaDetails.invoiceNumber,
            p_items: items,
            p_user_id: user.id
        });

        if (error) throw error;
        toast.success(`Recepción registrada: #${data}`);
        fetchProducts();
        setIsReceptionMode(false);
    } catch (error) {
        toast.error(error.message || 'Error en recepción');
    }
};
```

#### C. Agregar Validación de Permisos
```tsx
const canReceiveProducts = ROLE_PERMISSIONS[user?.role]?.canReceiveProducts;
if (!canReceiveProducts) {
    return <div className="p-8 text-red-500">Acceso denegado: Permisos insuficientes</div>;
}
```

---

### 2. **A MEDIANO PLAZO (Mejoras)**

1. **Crear tabla `suppliers` normalizada**
   - Referencia en `receptions`
   - Validación de proveedores únicos

2. **Mejorar Validaciones Frontend**
   - Validar cantidad > 0
   - Validar campos no vacíos
   - Mostrar confirmación antes de guardar

3. **Mejorar UX de Imágenes**
   - Permitir subir imagen directamente en recepción
   - Mostrar preview de imagen antes de guardar

4. **Logging Centralizado**
   - Usar logger de Supabase o Winston
   - Registrar errores con contexto completo

---

### 3. **A LARGO PLAZO (Arquitectura)**

1. **Migrar de Prisma SQLite a Supabase PostgreSQL**
   - `prisma/schema.prisma` define SQLite (¡INCORRECTO!)
   - Debería ser PostgreSQL puro + Supabase management

2. **Implementar Event Sourcing para Auditoría**
   - Tabla `events` inmutable
   - Todas las mutaciones generan eventos

3. **Multi-Store Architecture**
   - Actual: todos los productos en tabla única
   - Mejor: isolation by `store_id` + índices

---

## 📊 EVALUACIÓN FINAL

### Escala: 1-10 (1=Crítico, 10=Excelente)

| Criterio | Calificación | Justificación |
|----------|-------------|---|
| **Integridad de Datos** | **2/10** | Sin RPC atómico, sin garantía ACID, tablas inconsistentes |
| **Seguridad (RLS/Permisos)** | **3/10** | RLS bypassable, sin validación de roles, upsert directo |
| **UX** | **4/10** | Falta captura de detalles, sin validaciones visuales, incomplete modal |
| **Confiabilidad** | **3/10** | Fallos a mitad de proceso generan inconsistencia |
| **Modularidad de Código** | **6/10** | Componente monolítico (700 líneas), pero tipos bien definidos |
| **Documentación** | **7/10** | Existe documentación, pero desactualizada respecto a negocio real |
| **Cobertura de Funcionalidad** | **5/10** | Inventario ✓, Imágenes ✓, Recepción ❌ (faltan campos) |

### **EVALUACIÓN GLOBAL: 4.3/10** ⚠️

**Diagnóstico:** Componente FUNCIONAL pero CRÍTICO para producción

**Riesgos de Negocio:**
- 🔴 Imposible auditar origen de compras
- 🔴 Violaciones potenciales de consistencia BD
- 🔴 Errores 403 aleatorios si RLS está habilitado
- 🟠 Cumplimiento fiscal comprometido
- 🟠 UX confuso para usuarios

**Recomendación:** 
- ✅ DEBE implementarse RPC con SECURITY DEFINER
- ✅ DEBE capturarse campos obligatorios (fecha, proveedor, factura)
- ✅ DEBE validarse permisos por rol
- ⚠️ Refactoring completo recomendado para producción

---

## 🎯 PRÓXIMOS PASOS

1. **Implementar RPC `register_reception`** (1-2 horas)
2. **Actualizar componente WarehouseView** (2-3 horas)
3. **Agregar tests** (2-3 horas)
4. **Migración de datos** (1 hora)
5. **Validación en staging** (1-2 horas)

**Tiempo Total Estimado:** 7-11 horas

---

**Documento Generado:** 12 Enero 2025  
**Estado:** PENDIENTE IMPLEMENTACIÓN CRÍTICA
