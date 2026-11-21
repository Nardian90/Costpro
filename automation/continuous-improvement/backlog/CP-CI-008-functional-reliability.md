# CP-CI-008 — Fiabilidad funcional (auditoría de flujos y regresiones)

**Área**: fiabilidad · **Prioridad**: P2 (área) · **Estado inicial**: queued

## Objetivo
Auditar funcionalidades y flujos de negocio para encontrar errores de validación, inconsistencias de estado, problemas de persistencia, regresiones, errores de navegación, inconsistencias entre vistas y problemas de integración — preservando SIEMPRE las reglas financieras existentes.

## Criterios de entrada
- STATE.json sin lock; AGENTS.md (integridad financiera) + `costpro-visual-qa` (cadena E1–E4) + `costpro-code-reviewer` (patrones canónicos) leídos.
- Unidad = UN flujo de negocio concreto (lista abajo). Entorno: Supabase E2E o local — NUNCA producción.

## Unidades (flujos, una por ciclo)
- **U1 — Ciclo de venta → cobro** (ventas, recepciones de pago): validaciones de formulario, estados entre pasos, persistencia offline (Dexie) y sincronización, navegación atrás/adelante sin pérdida de datos.
- **U2 — Inventario → costos**: entradas/salidas, conteo físico, valoración SOLO como observador (PROHIBIDO tocar reglas de valoración); consistencia de visualización entre vistas de inventario e informe.
- **U3 — Caja → cierre**: arqueo, movimientos, cierre de caja; consistencia de saldos mostrados (solo presentación, no cálculo).
- **U4 — Multi-tienda**: cambio de tienda (StoreSelector) mantiene contexto consistente en vistas visitadas; sin fugas de datos entre tiendas en la UI.
- **U5 — Navegación**: todas las vistas registradas en `src/config/navigation/` alcanzan desde Sidebar/MobileTabBar/Command Palette; sin rutas muertas; `docs/mapa_vistas.md` actualizado si se detectan desvíos.

## Límites de alcance (regla central de esta misión)
Los cambios en inventarios, ventas, costos, caja, contabilidad o RRHH **deben preservar las reglas financieras existentes** (AGENTS.md): fórmulas, valoración, redondeos Decimal.js, moneda, comisiones, documentos comerciales, relaciones entre entidades, RLS, multi-tenant, autorizaciones, contratos API, migraciones — PROHIBIDO modificarlos. Esta misión corrige DEFECTOS DE INTERFAZ/ESTADO/NAVEGACIÓN; cualquier hallazgo que apunte a un error de regla financiera o de negocio se DOCUMENTA como propuesta separada para el propietario (misión nueva propuesta en STATE.json, sin implementar). No introducir datos ficticios en operaciones reales.

## Procedimiento
Fases A–H. Recorrido E2 completo del flujo con agent-browser (feliz + casos borde: campos vacíos, fechas futuras/pasadas, duplicados, offline) → inventario de defectos con nivel de evidencia → corregir SOLO defectos de UI/estado/navegación → specs E2E existentes del flujo (p. ej. `sales`/`cash`/`inventory`/`multi-store-*`) + verificación E2 → informe.

## Pruebas y criterios de aceptación
1. Flujo recorrido E2 con evidencia (capturas/pasos); defectos clasificados (corregido aquí / propuesto al propietario).
2. Specs E2E del flujo en verde tras los cambios; sin regresión en specs relacionados.
3. Cero cambios en reglas financieras (diff revisado contra la lista PROHIBIDO).
4. Informe con propuesta separada si hubo hallazgos de negocio (detalle, impacto, evidencia).

## Certificación esperada
APROBADA / APROBADA CON OBSERVACIONES / BLOQUEADA. Un ciclo con hallazgos financieros NO implementados pero documentados puede aprobarse con observaciones (las propuestas quedan registradas).
