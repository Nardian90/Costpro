# R-06 — AUDITORÍA DE CREADORES HISTÓRICOS (§0.5)

## Campo autoritativo

`receipts.user_id` — persistido en la creación, inmutable desde ahora por el trigger `receipts_pin_creator` (UPDATE de `user_id` → `ERR_CREATOR_IMMUTABLE`, para TODOS los actores incluido service_role). El creador se asigna desde la identidad autenticada (servidor/BD), nunca desde el navegador.

## Registros históricos

**Evidencia verificada en producción (PRE-aplicación, 2026-11-28):** la FK `receipts_user_id_fkey → auth.users` impide valores que no sean usuarios reales o NULL. El centinela `00000000-0000-0000-0000-000000000000` (fallback legacy de `register_reception` para `v_caller_uid` NULL) es **materialmente imposible** en la tabla bajo la FK vigente — la rama defensiva de `can_manage_reception` lo cubre igualmente como defense-in-depth documentado.

Recepciones históricas con `user_id IS NULL`:
- Se buscó el actor en campos originales y registros autoritativos de auditoría SOLO donde hay evidencia inequívoca (ningún caso requerido en esta misión: el catálogo previo no registró creadores NULL en producción).
- Sin evidencia inequívoca: **confirmación/anulación reservada al superadministrador** — implementado en `can_manage_reception` (creador NULL → false) y demostrado en el caso 27: encargado y admin de tienda rechazados; superadmin confirma.
- **No se reasignó ningún creador histórico** (regla de la misión §0.5: «No alteres los datos históricos del creador sin evidencia»). La migración NO toca datos.

## Tienda Pueblo (precedente)

Las 3 recepciones de Tienda Pueblo ya quedaron atribuidas al proveedor canónico por el procedimiento gobernado OWNER_CONFIRMATION de la misión precedente (#1735) — fuera del alcance de R-06, intactas.
