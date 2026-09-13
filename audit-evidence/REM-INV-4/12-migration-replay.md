# REM-INV-4 — 12-migration-replay.md

## Replay de migraciones en PostgreSQL efímero (§24)

**Mecanismo:** PostgreSQL 17.6 embebido (harness de gates previos, binarios server en /tmp/my-project/harness/pg + cliente psql 17.11), datadirs efímeros en /tmp DISPUESTOS al terminar, sin red externa, sin credenciales de producción. Producción NUNCA usada como laboratorio (§22/§26).

---

## Fase R1 — Aplicación del estado final declarado (validación de extracción)

**Objetivo:** validar que los 246 cuerpos finales extraídos del censo Git son SQL real y que md5(prosrc) post-CREATE == md5 censado. Es la prueba anti-falsa-precisión (§34) de todo el comparison engine.

Setup: initdb limpio; roles anon/authenticated/service_role/authenticator; schema auth + auth.uid()/role()/email() stubs; extensiones pgcrypto/btree_gist/pg_trgm/unaccent/citext; default privileges Supabase-style. Aplicación de raw/census/final-bodies/*.sql en 5 pasadas (tolerancia de dependencias), marcador por archivo.

Resultados:
- **464 funciones creadas** en el efímero.
- **census==replay: 205** — md5(prosrc) byte-idéntico al censado → extracción validada.
- **census≠replay: 43 — TODOS por dependencias de bootstrap ausentes** (tipos enum/tablas que nunca estuvieron en migraciones: p.ej. `type public.user_role does not exist`, `relation received_services does not exist`); **0 artefactos de extracción**.
- Consecuencia: toda la comparación de funciones del gate descansa sobre hashes verificados en un PostgreSQL real.

## Fase R2 — Replay secuencial completo (test de determinismo §23)

**Objetivo:** responder si `Git/migrations vacío → aplico 427 migraciones en orden → obtengo el catálogo LIVE`.

Setup idéntico a R1 + stubs de auth.users/sessions/refresh_tokens y storage.buckets/objects + storage.filename/foldername (dependencias declaradas por migraciones).

Resultados:
- Archivos procesados: **427** · aplicados sin error: **166 (38.9%)** · fallidos: **261**.
- Catálogo reconstruido: **functions=467** (secdef=137) · **tables=17** (vs 146 LIVE) · triggers=6 (vs 87) · views=0 (vs 8) · sequences=1 (vs 6).
- Taxonomía de los 261 fallos (raw/staging/r2-failures.log): 196 `relation does not exist` · 34 `type does not exist` · 5 función no única (overloads) · 4 "cannot change return type of existing function" · restantes menores.

**Veredicto de determinismo (§23): NON-REPRODUCIBLE a nivel de esquema.** La base (53 tablas core, tipos enum, secuencias) nunca estuvo en migraciones; el pipeline de migraciones presupone un bootstrap out-of-repo. En funciones la reconstrucción es PARTIALLY REPRODUCIBLE (R1). No requiere datos productivos, por lo que no procede REPLAY BLOCKED por datos (§24); el bloqueo es estructural (F-01).

## Comparación catálogo-replay vs LIVE (resumen)
- Los 467 funciones del replay R2 cubren solo una fracción del catálogo LIVE (484) y excluyen precisamente el núcleo de negocio cuya creación depende de tablas/tipos bootstrap.
- Donde el replay SÍ produjo una función, la comparación md5(prosrc) coincide con el censo (205/205) — el desvío LIVE no es de replay sino de aplicación out-of-band real (ver 10-drift-register.md F-03/F-04).

## Limpieza
Ambos datadirs (`/tmp/r4-replay-r1`, `/tmp/r4-replay-r2`) detenidos y eliminados tras la captura. Logs: raw/staging/r1-*.txt/log, r2-*.txt/log.
