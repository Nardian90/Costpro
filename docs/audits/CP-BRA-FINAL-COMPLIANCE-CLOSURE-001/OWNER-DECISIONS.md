# OWNER-DECISIONS — Decisiones expresas del propietario aplicadas en esta misión

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27
**Carácter:** todas las decisiones de §0 del prompt de la misión son VINCULANTES; no se sustituyó, amplió ni reinterpretó ninguna.

---

## Aplicadas íntegramente en esta misión

### §0.1 — R-03: pagos múltiples de órdenes de trabajo = OPERACIÓN PARCIAL
- **Decisión:** cada orden es independiente; un fallo no revierte las correctas; atomicidad DENTRO de cada orden (sin pagos parciales por fallo interno); sin transacción global all-or-nothing; el reintento no duplica.
- **Implementación:** migración `20261127160000`… ver expediente `R03-PARTIAL-PAYMENTS.md` (lote atómico por orden `register_ot_payment_batch` + ruta parcial `/api/payments/ot-batch`).
- **Evidencia:** batería E2E 17/17 (B2 = el ejemplo de aceptación literal del propietario) + pin R-25 convertido.

### §0.2 — `pay_commission`: autorizados admin, manager y ENCARGADO
- **Decisión:** roles de tienda admin/manager/encargado pueden pagar comisiones dentro de su tienda; clerk/usuario NO; verificación server-side + barrera autoritativa de BD; compatibilidad de administración de COSTPRO sin privilegios implícitos.
- **Implementación:** migración `20261127150000` (gate único `has_store_role_as(ARRAY['admin','manager','encargado'])`) + ruta por membresía (`canManageStore`) + fallback legacy eliminado. Ver `PAY-COMMISSION-AUTHORIZATION.md`.
- **Evidencia:** batería E2E 15/15 (A3 encargado OK; anti-spoofing M1/M2).

### §0.3 — Las tres recepciones históricas pertenecen a TIENDA PUEBLO (OWNER_CONFIRMATION)
- **Decisión:** la confirmación del propietario es la fuente de identificación; autorizada la corrección de la vinculación histórica por el procedimiento controlado; NO se inventa documentación externa (facturas, NIT, teléfonos, direcciones, contratos).
- **Implementación:** migración `20261127160000` (lista cerrada de 3 IDs, guards, corrección solo del campo supplier, auditoría OWNER_CONFIRMATION ×3). Ver `TIENDA-PUEBLO-REGULARIZATION.md`.
- **Evidencia:** prueba funcional 8/8 (conciliación 19,435 exacto; detención automática ante estado parcial o canónico ausente).

### §0.4 — R-11 (incidencias POS): política vigente mantenida
- **Decisión:** validación server-side obligatoria, estructura tipada, coherencia aritmética, descuadre explicado por incidencia válida, compatibilidad MISIÓN-FLEX; **SIN nuevo tope monetario, SIN porcentaje máximo, SIN supervisor por umbral** — no se introducen esos controles.
- **Aplicación:** catálogo POS-006 y RISK-REGISTER R-11 actualizados como POLÍTICA DECIDIDA; pins de regresión vigentes re-verificados; NO se debilitó ninguna validación existente; NO se añadió ningún tope.

### §0.5 — R-15 (unicidad de proveedores): política vigente mantenida
- **Decisión:** unicidad NO estricta; el sistema puede permitir duplicaciones deliberadas; coincidencia exacta → reutilizar; sospechoso → advertencia; duplicación deliberada → confirmación explícita con motivo y auditoría; **NO UNIQUE estricto por nombre; NO eliminar/combina históricos por aproximación**.
- **Aplicación:** catálogo PRO-001 y RISK-REGISTER R-15 actualizados como POLÍTICA DECIDIDA; verificado que el RPC `create_supplier_local` continúa aplicando la política (migración 20261126160000 vigente en E2E y producción).

## Decisiones PENDIENTES del propietario (identificadas, NO inventadas)

### PEND-1 — R-06 / PUR-001: roles de confirmación y anulación de recepciones
- **Estado:** único bloqueo condicional restante del alcance de las 16 reglas críticas (PUR-001 CONDICIONAL por R-06).
- **Estado del código (verificado 2026-11-27):** `confirm_pending_reception` exige membresía activa (`has_store_access_as`) — SIN gate de rol; `void_reception_with_reversal` guarda pagos vivos pero sin segundo nivel de rol; la vía app llama los RPC con el cliente de sesión.
- **Recomendación concreta (a decidir):** alinear con el modelo ya aprobado en R-05/§0.2 —
  - **Alternativa A (recomendada, simétrica con R-05):** exigir rol de gestión `has_store_role_as({admin,manager,encargado})` para CONFIRMAR recepciones y para ANULAR con reversión (anulación es la operación más destructiva), con auditoría transaccional de ambos actos; clerk/usuario quedan en draft/consulta. Impacto operativo bajo (los mismos tres roles ya gestionan inventario).
  - **Alternativa B:** mantener membresía simple para CONFIRMAR y exigir rol de gestión solo para ANULAR (reversión de inventario + CxP).
  - **Consecuencia de no decidir:** PUR-001 permanece CONDICIONAL y el alcance pleno de certificación mantiene esa excepción documentada (no es defecto técnico: los guards de integridad — WAC, pagos vivos, transiciones — están certificados; es un control de AUTORIZACIÓN pendiente de política).
- **Responsable:** propietario (decisión) → misión futura (implementación + batería + §11g).

### PEND-2 — Destino del proveedor placeholder «—» en el catálogo
- **Estado:** el registro `suppliers` con name='—' permanece intocado (bucket histórico de excepciones). Su eliminación/renombre es una decisión de datos del propietario (fuera del alcance de esta misión).

### PEND-3 — (Previamente registradas, sin cambio) tope por incidencia POS y UNIQUE de proveedores
- Confirmadas como NO decididas por el §0.4/§0.5 (el propietario decidió explícitamente NO implantarlas — dejan de ser "pendientes" y pasan a "rechazadas por decisión" en el catálogo).
