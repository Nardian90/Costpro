# Decisiones Complejas — Auditoría Multi-Tienda

## Pendientes de decisión del usuario

### 1. Modal de Reglas de Comisión (C1 — WorkersView)

**Problema:** Los botones "Nueva regla" y "Editar regla" no abren ningún modal. El estado `showRuleModal`/`editingRule` existe pero no hay JSX que lo consuma. La feature completa de CRUD de reglas está rota desde UI.

**Opciones:**
- **A) Implementar RuleFormModal completo**: ~4h de trabajo. Modal con campos: type (%/fijo/salary/hybrid), value_percent, fixed_value, salary_amount, base_calculation, priority, valid_from, valid_to. Validación client-side + POST/PATCH a /api/commissions/rules.
- **B) Usar modal genérico existente**: adaptar BaseModal con un form inline.
- **C) Dejar para sprint dedicado**: si las reglas se crean desde otro flujo (ej. API directa).

**Recomendación:** Opción A — es la feature más visible y esperada por el usuario.

---

### 2. Exclusion Constraint para periodos solapados (C4 — Contable)

**Problema:** El índice UNIQUE actual solo bloquea periodos idénticos. Permite solapamientos reales (ej: [01-01, 01-31] y [01-15, 02-15]) que duplican comisión.

**Solución técnica:**
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE commission_payments
  ADD CONSTRAINT no_overlapping_periods
  EXCLUDE USING gist (
    worker_id WITH =,
    daterange(period_start, period_end, '[]') WITH &&
  ) WHERE (status != 'cancelled');
```

**Riesgo:** Si ya existen periodos solapados en producción, el ALTER fallará. Necesita query de verificación previa.

**Recomendación:** Implementar pero primero ejecutar:
```sql
SELECT * FROM commission_payments cp1
WHERE EXISTS (
  SELECT 1 FROM commission_payments cp2
  WHERE cp1.worker_id = cp2.worker_id
    AND cp1.id != cp2.id
    AND cp1.status != 'cancelled' AND cp2.status != 'cancelled'
    AND cp1.period_start <= cp2.period_end
    AND cp2.period_start <= cp1.period_end
);
```

---

### 3. Pro-rateo de comisiones cuando la regla cambia a mitad del periodo (A5)

**Problema:** Si una regla cambia de 5% a 7% durante el periodo, el cálculo usa solo la última regla para todo el periodo.

**Opciones:**
- **A) Implementar pro-rateo**: iterar sobre sub-periodos delimitados por cambios de regla. ~6h.
- **B) Documentar limitación**: mostrar warning al usuario "Se usó la regla vigente al final del periodo".
- **C) Dividir manualmente**: el usuario crea dos pagos con periodos más cortos.

**Recomendación:** Opción B (documentar) por ahora. El pro-rateo es complejo y requiere cambios en commission-engine.ts.

---

### 4. HistoryTab con `<a href>` al API (A3)

**Problema:** El link "Ver versiones" navega fuera de la SPA mostrando JSON crudo.

**Opciones:**
- **A) Implementar RuleVersionDrawer**: drawer lateral que carga versiones con apiFetch y muestra diff visual.
- **B) Abrir en nueva pestaña**: `target="_blank"` — mínimo esfuerzo pero mala UX.
- **C) Quitar el link**: si no hay recurso para implementar el drawer ahora.

**Recomendación:** Opción C temporalmente (quitar link) hasta implementar el drawer.

---

### 5. Tabla de 9 columnas en móvil (M1)

**Problema:** La tabla de trabajadores no colapsa en móvil. Overflow horizontal constante.

**Opciones:**
- **A) Convertir a cards en `<sm`**: 1 card por worker con datos apilados. ~3h.
- **B) Ocultar columnas menos importantes en móvil**: CSS `hidden sm:table-cell`. ~30min.
- **C) Scroll horizontal con indicador**: ya existe pero es mala UX.

**Recomendación:** Opción B (rápido) ahora, Opción A después.

---

## Resumen de decisiones pendientes

| # | Decisión | Impacto | Recomendación |
|---|---|---|---|
| 1 | RuleFormModal | CRÍTICO — feature rota | Implementar (A) |
| 2 | Exclusion constraint | CRÍTICO contable | Implementar con verificación previa |
| 3 | Pro-rateo | ALTO contable | Documentar limitación (B) |
| 4 | HistoryTab link | ALTO UX | Quitar link temporalmente (C) |
| 5 | Tabla móvil | MEDIO UX | Ocultar columnas (B) |
