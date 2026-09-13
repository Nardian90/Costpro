# 10 — SECURITY (REM-INV-2R, fase 14)

## Superficie de la función retirada

| Verificación | Método (SELECT-only) | Resultado |
|---|---|---|
| receive_purchase en CUALQUIER schema / firma | pg_proc × pg_namespace por proname | **0 filas** |
| receive_purchase(uuid) en public | pg_proc × firma identidad | **0 filas — ABSENT** |
| EXECUTE residual (authenticated) | has_function_privilege | **42883 does not exist** ⇒ sin superficie |
| EXECUTE residual (anon) | (idem, cubierto por ausencia del objeto) | NONE |
| ACL del objeto | aclexplode / routine_privileges | **0 grants — NONE** |
| Callers DB / triggers / dependencias | fase 2 y 9 | 0 / 0 / 0 |

Con el objeto eliminado no existe privilegio EXECUTE revocable ni explotable: la superficie
residual que mantenía F-01 en CONDITIONAL (`receive_purchase(uuid) EXECUTE para
authenticated`) queda eliminada de raíz, no solo cerrada.

## Ruta canónica (sin cambios de seguridad)

- receive_against_po / register_reception / confirm_pending_reception / void_reception_with_reversal:
  definiciones byte-idénticas PRE/POST y ACLs idénticas (ver 03 y 06).
- El vector residual P2 de REM-INV-2 (status-flip directo de OC por authenticated vía
  receive_purchase) queda eliminado junto con la función.

## Secret scan

| Fuente | Patrón | Hits |
|---|---|---|
| git diff --cached (staged completo) + pack REM-INV-2R (md + assets) | github_pat_ · sb_secret_ · sbp_ · sk_live · JWT eyJ… · private keys (RSA/EC/OPENSSH/PGP) · supabase_access_token · password= | **0** |
| `.env` trackeado en git | `git ls-files .env` | **0 archivos** |
| `.gitignore` | línea 34: `.env*` | cubierto |
| PAT de push | solo en `.git/config` local (gitignored por naturaleza); jamás impreso ni registrado | n/a |

## Contrato de seguridad no debilitado

- El contract test se EXTENDIÓ (pin de reintroducción), ninguna regla previa se relajó;
- No se alteró ninguna otra función, RLS, policy, grant ni search_path;
- No se abrió ningún camino de ejecución nuevo (solo se cerró/eliminó uno).

Raw: `assets/phase14-security.json`.
