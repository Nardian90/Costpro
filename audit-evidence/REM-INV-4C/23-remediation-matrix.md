# REM-INV-4C — 23 Matriz final de hallazgos

| Finding | Function | Severity | PRE exposure | Legit callers | Fix | POST | Production | Status |
|---|---|---|---|---|---|---|---|---|
| RES-4C-1 | `has_store_role(uuid,uuid,text[])` | P3 | PUBLIC EXECUTE → anon=true (contradice intención FIX H-7 20260820000001; cuerpo liga `auth.uid()`, sin oráculo E8 — probado) | 0 policies · 2 SECDEF internos (como postgres) · 0 app/browser | `REVOKE EXECUTE … FROM PUBLIC` (1 stmt) | anon=false, public=false; auth/svc/postgres intactos | aplicado HTTP 201; diff = 2 ACL | **CLOSED** |
| RES-4C-2 | `current_user_tenant_id()` | P3 | PUBLIC+anon EXECUTE → anon=true (retorna NULL sin JWT; 0 policies TO anon) | 29 policies `TO authenticated` · 3 SECDEF internos · 0 app/browser | `REVOKE EXECUTE … FROM PUBLIC` + `REVOKE … FROM anon` (2 stmts) | anon=false, public=false; auth/svc/postgres intactos | aplicado HTTP 201; incluido en diff | **CLOSED** |
| RES-4B-1 (precedente) | ídem RES-4C-1 | — | — | — | heredado y cerrado por este gate | — | — | **CLOSED** |
| RES-4B-2 (precedente) | ídem RES-4C-2 | — | — | — | heredado y cerrado por este gate | — | — | **CLOSED** |
| RES-4C-3 (doc) | `has_store_role(uuid,text[])` | P3 | ya restringido (no PUBLIC, anon=false) | 20 policies + 6 SECDEF | **KEEP** — sin cambio | sin drift | sin cambio | **NO CHANGE REQUIRED** |
| RES-4C-4 (doc) | `has_store_role_as(uuid,uuid,text[])` | P3 | ya restringido (service_role+postgres; 42501 anon/auth) | 2 SECDEF | **KEEP** (§7-F2: no modificar; solo documentar) | sin drift | sin cambio | **NO CHANGE REQUIRED** |
| RES-4B-3 (heredado) | docs ITERATION_8 PAT truncado | higiene | fragmento no utilizable | n/a | fuera de alcance (documental) | — | — | **DEFERRED** (no bloquea) |
| RES-4B-4 (heredado) | rama legacy get_transferable_stores | P3 | sujeto ya ligado al caller (sin disclosure de terceros) | frontend único | fuera de alcance 4C (REM-INV-4B §10) | — | — | **DEFERRED** (no bloquea) |

Cada finding con evidencia: 01 (censo), 06 (callers), 08/11 (ataques PRE/POST), 16/17 (ACL), 18 (diff), 19-21 (zero-touch).
