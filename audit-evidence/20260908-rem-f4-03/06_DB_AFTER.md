# 06 — DB AFTER (verificación viva post-apply)

**Apply:** `evidence/remf403-apply-log.txt` (HTTP 201 @ 2026-09-09T03:55:14Z,
migration SHA256 `6835517c987dba5d5b6aff71b8daa83d679b59a052c0bcf198acff7468ad77f1`)
**Verificación:** `evidence/remf403-db-after-acl.txt`

## ACL efectiva POST

```json
{"proname":"withdraw_production_item_v3","prosecdef":true,
 "acl":"postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres",
 "anon_exec":false,"auth_exec":true,"svc_exec":true,"public_exec":false}
```

| Rol | EXECUTE | Cumple directiva §21 |
|---|---|---|
| anon | ❌ | DENY ✅ |
| authenticated (miembro) | ✅ (vía validación interna) | ALLOW ✅ |
| authenticated (no-miembro) | grant sí, pero `has_store_access_as` false → `ERR_UNAUTHORIZED` | DENY ✅ |
| service_role | ✅ (sin cambios del estado PRE) | según necesidad legítima ✅ |
| PUBLIC | ❌ | sin privilegios globales ✅ |

## Intento 1 (evidencia del guard activo)

`evidence/remf403-apply-ATTEMPT1-GUARD-ABORTED.txt`: el primer apply fue
abortado por el GUARD PRE (falso negativo del LIKE por espacio en
`proconfig`). La transacción abortó SIN aplicar nada — la BD quedó intacta.
Esto demuestra que los guards de la migration son operativos: si el estado
PRE difiriera del esperado, la migration NO aplica. Preservado como evidencia
honesto (no se reescribió el log).

## Sin otros cambios

- Definición de `_v3`: byte-idéntica pre/post (solo ACL añadida).
- `withdraw_production_item` sigue AUSENTE (no se inventa la función muerta).
- Fingerprint estructural Z4 PRE == POST (484 funciones / 87 triggers / md5
  `dd655ca6…`) — la migration no creó ni borró funciones/triggers.
- REM-F4-04 intacto (P0 de la suite lo re-verificó post-migration).
