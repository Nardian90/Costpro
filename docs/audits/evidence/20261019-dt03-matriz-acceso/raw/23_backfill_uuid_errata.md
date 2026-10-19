# Nota de errata — UUID de Default Tenant (2026-10-20)

El literal del prompt v2 y la copia local del dossier mostraban el tenant destino
como `5364ccf8-e6cd-4c38-aea8-b167b35b5576f` (13 caracteres en el último grupo —
formato UUID inválido). El valor VIVO de la BD (autoritativo, verificado en el
dry-run y en la ejecución) es **`5364ccf8-e6cd-4c38-aea8-b167b3b5576f`**
(12 caracteres finales; tenants.name = 'Default Tenant', creado 2026-08-04).

El script recreado usa el valor vivo. La errata de transcripción queda documentada
también en el `metadata` de la fila de audit_logs (`uuid_note`).
