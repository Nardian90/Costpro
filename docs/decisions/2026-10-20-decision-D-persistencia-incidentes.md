# DECISIÓN D — Persistencia de incidentes legales / BUG-024 (REGISTRO)

> **Estado del registro:** `RATIFICADA` (2026-10-20). Este archivo REGISTRA una
> decisión ya tomada por el propietario; no crea ninguna decisión nueva. Preparado en
> la Misión C (2026-10-21). **La elección de persistencia NO es una decisión
> pendiente**: no debe volverse a plantear.

| Campo | Valor |
|---|---|
| Decisión | Persistir los incidentes legales en **`audit_logs` con `action='legal_incident'`** (alternativa 1: sin tabla nueva). `data/incidents.json` queda DEPRECADO (vacío, verificado 2026-10-21). |
| Ratificada por | Propietario (2026-10-20; ratificación registrada en el cierre de la Misión C previa — fase 9 del expediente CP-SEC-027) |
| Fuentes primarias | `docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §D (alternativas) · `docs/audits/evidence/20261020-mision-c-cierre/INFORME.md` §D (implementación) · `docs/audits/MISION_B_VERIFICACION_CP-SEC-012_2026-10-21.md` (verificación) |
| Implementación | PR **#1431** fusionado por el propietario (2026-10-19T19:01:52Z): POST `/api/legal/incidents` escribe UNA fila en `audit_logs` (id legible `INC-YYYYMMDD-XXXXXXXX`); GET admin-only nuevo (`withRole('admin')`, paginado) lee el legajo. Tests de contrato 8/8 PASS (verificados de nuevo el 21/10 en SHA e6d885). |
| IDs relacionados | **CP-SEC-012** (subcaso BUG-024 — cerrado por esta decisión; el expediente completo se cerró en la Misión B del 21/10) |

## Riesgos residuales documentados (NO reabrir; gestionar como tareas independientes)

| Residual | Estado | Fuente |
|---|---|---|
| Índice parcial `20261020000005` (sostiene el GET admin; migración PREPARADA, NO aplicada) | Pendiente de autorización **A4** del expediente CP-SEC-027 v5 (`PAQUETE_D_LEGAL_INCIDENTS.md`) | `docs/audits/CP-SEC-027_v5_INFORME_DECISIONES_2026-10-21.md` §3/§6 |
| Skip E2E obsoleto en `e2e/legal.spec.ts:80-82` | Pendiente de actualización autorizada de specs | `docs/audits/MISION_B_VERIFICACION_CP-SEC-012_2026-10-21.md` |
| Sonda HTTP contra despliegue vivo | Pendiente de URL del propietario | Ídem |

## Advertencia de alcance (Misión C)

Esta decisión pertenece al subcaso BUG-024 del expediente CP-SEC-012/CP-SEC-027. Su
existencia **no autoriza** extrapolaciones a otros destinos de persistencia ni a
otros IDs del inventario maestro. Cualquier aplicación análoga (p. ej. otros
registros de evidencia) requiere decisión propia del propietario.
