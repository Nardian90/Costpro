# Worklog — Programa COSTPRO 4 Multitienda

---
Task ID: REC-20261019-1
Agent: Agente principal (Z.ai)
Task: Recuperación del entorno tras reinicio y diagnóstico CP-SEC-027 (PR #1422/#1424, migraciones 20261018000000/20261019000001, estado real de producción). Modo: SOLO LECTURA sobre producción; sin escrituras, sin merges, sin backfill, sin despliegues.

Work Log:
- Inventariado el entorno tras reinicio: sin worklog previo, sin clon previo, sin dossiers locales; solo 3 documentos canónicos del 2026-10-16 en upload/.
- Clon limpio de https://github.com/Nardian90/Costpro (con PAT) en /home/z/my-project/costpro-recovery; main = 98e0d31e2 (merge PR #1424).
- GitHub API: PR #1422 merged (15eebf46b, 2026-10-19T10:49:53Z); PR #1424 EXISTE y merged (98e0d31e, 10:51:49Z) — premisa "nunca creado" corregida; PR #1423 único abierto; CI main 5/5 verde.
- Localizadas ambas migraciones en main y evidencia completa: docs/audits/evidence/20261019-cp-sec-027-publico/ (INFORME + 10 raw), 20261019-dt03-matriz-acceso/ (INFORME + BACKFILL_DAVID9999_DOSSIER.md + 14 raw), DECISIONES_PENDIENTES_MISION_C (A, B confirmada, B.1, C, D, E).
- Diagnóstico read-only de producción (scripts/diag_estado_produccion_costpro.js): NINGUNA de las 2 migraciones registrada ni aplicada (validate_operation_date vivo conserva tope hoy+1; vistas 404; policies anon vivas; grants vivos); exposición ACTIVA: 103/103 costos legibles por anon, 10 stores con tenant_id; david9999 SIN ejecutar (tenant_id NULL, 0 rastros audit); 11 perfiles NULL intactos.
- Re-ejecutado el script oficial cpsec027_post_migration_verify.js: 18/18 FALLOS = estado pre-fix confirmado hoy (la línea base previa refleja el estado actual).
- Única pérdida real del reinicio: scripts/dt03_backfill_david9999_execute.js (nunca pusheado; SQL íntegro recuperable del dossier §5).
- Generado dossier docx del diagnóstico (skill docx: receta R1 + paleta DM-1, 3 secciones, TOC, 5 tablas; postcheck 9/9, 0 errores).

Stage Summary:
- Tres estados independientes verificados: PR fusionado SÍ (ambos) / migración aplicada NO (ninguna) / corrección verificada NO (18/18 fallos).
- NO se necesita PR nuevo para CP-SEC-027 (ya fusionado en main con alcance exclusivo; duplicar estaría prohibido).
- Entregables: download/diagnostico-recuperacion-20261019/INFORME_RECUPERACION_ENTORNO_COSTPRO_2026-10-19.docx + raw_estado_produccion_readonly.json.
- Pendiente SOLO con autorización del propietario: aplicar 20261019000001 (3 fases: aditiva → reinicio pm2 desde main → retirada), aplicar 20261018000000 (Decisión E, baseline vence 2026-11-30), backfill david9999 (autorización escrita; recrear script ejecutor), decisiones A/B.1/C/D.
- Restricción crítica de secuencia: NO reiniciar pm2 desde main antes de la fase aditiva SQL (la vitrina degrada a 404 mientras las vistas no existan).

---
Task ID: PAQ-20261019-2
Agent: Agente principal (Z.ai)
Task: Preparar el paquete de ejecución de CP-SEC-027 (orden operativa del propietario): Fases A-B-C separadas y exactas con la migración exclusiva 20261019000001, las 7 verificaciones obligatorias y el plan de despliegue con PM2 apagado. Modo: SOLO PREPARACIÓN — sin ejecutar SQL de cambio, sin tocar producción, sin reiniciar PM2.

Work Log:
- Cargadas skills costpro-security-auditor, costpro-sql-performance-optimizer y docx (cadena completa: create.md, common-rules.md, design-system.md R1+DM-1, docx-js-core.md, toc.md, scenes/report.md).
- Verificado el worklog previo (REC-20261019-1): clon en costpro-recovery con main local en 98e0d31e; diagnóstico read-only de producción de hoy 11:07Z disponible en raw_estado_produccion_readonly.json.
- git fetch: HECHO NUEVO — origin/main avanzó a 2be38e21b: PR #1423 (fechas-trabajo) fusionado a las 2026-10-19T11:34:48Z (verificado vía API). Documentado como punto de decisión de la Fase B; el paquete fija el despliegue al commit exacto 98e0d31e y excluye el PR #1423 de la ventana.
- Releída la migración 20261019000001 completa (238 líneas): secciones 1-4 (vistas security_barrier + grants) / 5a-5c (DROP policies + policy variantes solo authenticated con mismo predicado + REVOKE), bloque de reversión propio y despliegue en 3 fases recomendado en el encabezado.
- Mapeados los consumidores con diffs del PR #1424: vitrina SSR y storefront API migrados a las vistas (cliente anon); ruta RPC y publish flows por service-role sin cambios; dos bugs silenciosos previos corregidos de paso (stock 0 por consulta a inventory sin acceso anon; filtro de variantes sobre columna inexistente). stock_current ausente del select del API ya en el estado pre-fix (no regresión).
- Verificados los artefactos de aceptación: script cpsec027_post_migration_verify.js (18 aserciones), prueba de integración de 26 invariantes (A.1-A.14, B.1-B.8, C.1-C.4), E2E-SF-001/002/003 en e2e/flows/catalog-storefront.spec.ts (Playwright sin webServer; fixtures con ciclo de datos piloto y limpieza), humo real /tienda/puerto-padre-vitallcons.
- Confirmada la independencia total frente a 20261018000000 (cero archivos en común; objetos distintos; ninguno requiere al otro) y la operativa del servidor: PM2 app costpro, scripts/start.sh (treekill, limpieza de puerto), bun server.ts, dotenv sobre .env, NODE_ENV=development del ecosystem.
- Extraído SQL VERBATIM por fases (scripts/extraer_sql_fases_cpsec027.js): fase_a_aditiva.sql (90 líneas, secciones 1-4), fase_c_restriccion.sql (24 líneas, 5a-5c), fase_a_rollback.sql y fase_c_rollback.sql (del bloque de reversión de la propia migración), todos con cabecera de trazabilidad; creado t0_linea_base_readonly.sql (nuevo, SELECT puro, necesidad documentada: captura T-0 y validación del rollback C).
- Generado el documento PAQUETE_EJECUCION_CP-SEC-027_2026-10-19.docx (scripts/paquete_ejecucion_cpsec027.js; receta R1 + paleta DM-1; 14 secciones H1 + anexo, 13 tablas, SQL incrustado leyendo el archivo fusionado en tiempo de generación; 3 secciones portada/índice romano/cuerpo arábigo).
- Post-proceso: add_toc_placeholders.py --auto (29 entradas, exit 0), patch_footers_costpro.py (ROMAN/arabic + pgNumType vacío eliminado), postcheck.py 8/9 con 0 errores (única advertencia: interlineado de los bloques SQL monoespaciados, intencional). Integridad verificada por marcadores clave en párrafos y tablas (SHAs, SQL, comandos, rollback, criterios, autorizaciones).

Stage Summary:
- Paquete de ejecución completo y DETENIDO para autorización expresa: nada se ejecutó contra producción en esta tarea (solo lecturas previas ya registradas).
- Decisiones registradas que el propietario debe conocer al autorizar: (1) main avanzó a 2be38e21b tras el PR #1423 — el plan fija la Fase B al commit 98e0d31e y excluye #1423, alternativa marcable expresamente; (2) reversión de C reabre el P1 (emergencia documentada); (3) ventana con compuertas go/no-go T-0/A/B/C/cierre, ~20 min; (4) E2E-SF siembra y limpia datos piloto vía service-role dentro de la ventana autorizada por los criterios de aceptación.
- Entregables en download/cp-sec-027-paquete-ejecucion/: PAQUETE_EJECUCION_CP-SEC-027_2026-10-19.docx + fase_a_aditiva.sql + fase_c_restriccion.sql + fase_a_rollback.sql + fase_c_rollback.sql + t0_linea_base_readonly.sql.
- Pendiente SOLO con autorización del propietario: ejecutar T-0, Fase A, Fase B (arranque en frío PM2 con checkout 98e0d31e) y Fase C, seguidas de la verificación 18/18 PASS + E2E-SF + humo + archivado de evidencia post-fix.

---
Task ID: REV-20261019-3
Agent: Agente principal (Z.ai)
Task: Revisión final del paquete CP-SEC-027 solicitada por el propietario — resolver 5 puntos (T-0, E2E, commit, migración, reversión) con comprobaciones de solo lectura y entregar el plan definitivo. Sin ejecutar SQL de cambio, sin tocar producción, sin reiniciar PM2.

Work Log:
- git fetch: origin/main = 2be38e21bf7c7394e1831972938c8422f659bae1 confirmado; 98e0d31e es ancestro directo (5 commits intermedios: todos PR #1423 fechas-trabajo + fix CI TS1117). Nueva rama remota recertify/surface-post-1423 (2 commits, SIN fusionar: re-certificación de surface post-migración + reconciliación ACL overload /26) — contexto, cero impacto en main.
- Diff 98e0d31e..2be38e21b: 39 archivos, +3162/−18, exclusivamente feature fechas-trabajo + fix PGRST203 de checkout (app envía siempre p_notes/p_payment_incidents) + migración NUEVA 20261018000001_drop_legacy_create_sale_v2_overload.sql (fuera de alcance de la ventana) + auth.fixture.ts +9 (invalidateFreshCache — fuera de la cadena de imports de catalog-storefront.spec.ts).
- Checksums sha256 IDÉNTICOS en ambos SHAs: migración 20261019000001 (5c2b8f97a2bfef2c…), scripts/cpsec027_post_migration_verify.js (bec0ae2e3f55ec09…), e2e/flows/catalog-storefront.spec.ts (8c180c5795b35a38…) → superficie CP-SEC-027 byte-idéntica; consumidores SSR/API de la vitrina sin cambios en el diff.
- CI vía API GitHub: 2be38e21b VERDE (Security Audit success; Unit & Integration success; TypeCheck+Lint+Unit+Build success; E2E skipped ×2 — idéntico patrón a 98e0d31e).
- Análisis E2E (punto 2): catalog-storefront.spec.ts SÍ escribe vía service-role — sb = svc() con SERVICE_KEY: seedProduct → INSERT products (incluye cost_average) + INSERT inventory; E2E-CAT-003 → PATCH profiles.active_store_id; cleanupProducts → DELETE en transaction_items/transactions/inventory/stock_movements/products; restoreActiveStore → PATCH profiles; signIn → POST auth. Modo reuse (DEFAULT): NO crea/borra tiendas (pilotos persistentes protegidos, fail-closed; requiere provision-pilot-env.cjs si los pilotos no existen). E2E_BASE_URL default localhost:3000 → contra producción solo con autorización específica. Alternativa segura propuesta para la ventana: verify 18/18 + humo read-only (/tienda/puerto-padre-vitallcons + /api/storefront/<slug> + probes anon 401/200) como compuerta de C.
- Verify script grep: 0 operaciones de escritura — 100% solo lectura (18 checks).
- Re-audit de los SQL extraídos del paquete: fase_a_aditiva.sql completo y válido (109 líneas, 3 vistas security_barrier + 3 GRANTs, exclusiones correctas); fase_c_restriccion.sql completo y válido (DROP policies + policy variantes solo-authenticated + REVOKE ×3); fase_a_rollback.sql válido. DEFECTO CRÍTICO en fase_c_rollback.sql: la extracción mecánica perdió las líneas de continuación de los CREATE POLICY (sin FOR SELECT TO/USING) y el BEGIN → SQL sintácticamente inválido que habría fallado en la peor emergencia. REGENERADO (v2) verbatim del bloque PROCEDIMIENTO DE REVERSIÓN de la migración (líneas 206-224), fidelidad validada por diff -w (OK), predicados cotejados contra t0_linea_base_readonly.sql §1. Migración fusionada NO tocada.
- Credenciales Supabase no persistentes en el sandbox → la re-captura live de T-0 se ejecuta al inicio de la ventana en el servidor (régimen del paquete); captura de referencia 11:07:28Z vigente; cero escrituras realizadas desde entonces (ninguna fase ejecutada).

Stage Summary:
- 5 puntos resueltos con evidencia verificada (checksums, diff, CI API, grep, lectura de fixtures). Recomendación de commit: 2be38e21b (main actual) — superficie CP-SEC-027 idéntica, CI verde, corrige PGRST203 vivo de checkout, evita segundo despliegue; alternativa 98e0d31e documentada pero deja el bug de checkout activo. Decisión final: propietario.
- Hallazgo material: fase_c_rollback.sql v1 inválido → corregido v2; el resto del paquete intacto y aceptado por el propietario.
- NADA ejecutado contra producción en esta tarea. DETENIDO esperando: (1) SHA de despliegue, (2) decisión E2E-SF (sustitución read-only vs autorización expresa de escrituras piloto), (3) orden de inicio de la ventana T-0 → A → B → C (~20 min).

---
Task ID: D0-20261019-4
Agent: Agente principal (Z.ai)
Task: D0 — Diagnóstico de solo lectura de la incidencia ENER-VIDA (404 vitrina) previo a T-0 de la ventana CP-SEC-027 autorizada. Cero escrituras; solo lectura de código + GET públicos.

Work Log:
- Pre-vuelo: SHA autorizado confirmado 2be38e21bf7c7394e1831972938c8422f659bae1 (merge PR #1423, padres 98e0d31e+18ff637d0); artefactos CP-SEC-027 presentes en el árbol. Sin ~/.ssh, sin tokens Vercel/Supabase en el sandbox (limitación declarada).
- Código 2be38e21b: /tienda/[slug]/page.tsx resuelve tienda desde public_storefronts_v (vista) con cliente anon; storeError|!store → notFound() → not-found.tsx que renderiza exactamente "404 / Error al cargar el catálogo / No se pudo cargar el catálogo de productos…" (t('errorTitle')/t('errorDescription') es.json §567-568). generateStaticParams con try/catch→[] (el build NO falla sin vistas). API /api/storefront/[slug]: stores→public_storefronts_v, productos→public_catalog_v, variantes→public_variants_v; error → createApiError('STORE_NOT_FOUND').
- PR #1424 (15eebf46b→98e0d31e) storefront diff: exactamente 2 archivos (page.tsx + route.ts), tablas→vistas. PR #1423: cero impacto en tienda/storefront (verificado por diff).
- Sonda HTTP read-only (scripts/d0_probe_vercel.js, ~8 GET, bajo rate-limit) contra costpro4.vercel.app, 2 rondas + cache-buster:
  * /tienda/enervida-vitallcons, /tienda/puerto-padre-vitallcons y un slug control INEXISTENTE: LOS TRES renderizan la MISMA página "Tienda no encontrada" (title = seoNotFound; marcadores not-found.tsx presentes; HTTP 200 medido — matiz de transporte; el UI muestra "404"). x-vercel-cache MISS en ambas rondas; determinista.
  * /api/storefront/enervida-vitallcons y puerto-padre: AMBOS 404 {"error":"Tienda no encontrada","key":"apiErrors.storeNotFound"} — coincide byte a byte con createApiError del código actual.
  * Landing / : 200 saludable → app viva; fallo aislado a rutas dependientes de tienda.
  * supabase ref en HTML de todas las páginas: wthkddeleylijmonclxg → Vercel apunta a la MISMA BD producción (sin deriva staging).
  * costpro.onrender.com (superficie legada en SITE_URL fallback): sin respuesta (timeout) — no es parte del despliegue activo.
- CONCLUSIÓN D0: fallo SISTÉMICO, no específico de ENER-VIDA. El despliegue Vercel ejecuta código post-#1424 (resuelve tiendas vía public_storefronts_v) contra una BD donde las vistas NO existen (línea base 11:07Z + sondas vivas 12:4xZ) → todas las vitrinas caen al not-found. ENER-VIDA y puerto-padre fallan de forma idéntica; el control inexistente también. Causa: despliegue automático del código #1424 en Vercel ANTES de ejecutar la Fase A (desincronización código-BD anticipada por la regla de secuencia del paquete).
- T-0: NO EJECUTABLE desde el sandbox (faltan SUPABASE_ANON_KEY + SUPABASE_ACCESS_TOKEN; la captura 11:07Z sigue siendo la referencia). Evidencia proxy viva: estado pre-A persiste (vista ilegible vía app). Ventana DETENIDA en T-0 por limitación de acceso, NO por divergencia.

Stage Summary:
- D0 COMPLETO con evidencia: causa raíz = código post-#1424 en Vercel + vistas inexistentes en BD (certeza alta). ENER-VIDA no es un caso especial; la Fase A de la ventana aprobada es la corrección esperada (a VERIFICAR post-A, no presumir). Hipótesis residual: datos específicos de enervida (activa/slug) solo verificable post-A o con acceso BD.
- T-0 BLOQUEADO por credenciales. Opciones presentadas al propietario: (a) entregar anon key + access token → agente ejecuta T-0→A→C; (b) propietario ejecuta los 3 artefactos read-only y comparte salida; (c) aceptación expresa de la captura 11:07Z + sondas D0 como línea base.
- CERO escrituras realizadas. Migraciones excluidas intactas. Evidencia en download/d0-enervida-20261019/ (d0_sondeo_readonly.json + raw/).

---
Task ID: EJ-20261019-5
Agent: Agente principal (Z.ai)
Task: EJ — Ejecución de la ventana CP-SEC-027 autorizada por el propietario (SHA 2be38e21b): T-0 → Fase A → Fase B (arranque en frío PM2 con .env entregado) → Fase C → verificación 18/18, con hallazgo y hardening P0 de por medio. Después, PR de respaldo del trabajo en Nardian90/Costpro.

Work Log:
- Credenciales entregadas por el propietario (opción (a) del D0): anon publishable, service-role, access token y PAT de GitHub → escritura en .env (gitignored, 14 vars inyectadas por el ecosystem); verificado origin/main = 2be38e21bf7c7394e1831972938c8422f659bae1 (SHA autorizado sin deriva) y pm2 7.0.4 + bun 1.3.14 instalados en el sandbox.
- T-0 EJECUTADO (línea base viva, read-only, Management API): 3 policies anon exactas vivas; grants anon sobre tablas presentes y 0 sobre vistas; vistas inexistentes; RLS activo; migraciones de hoy NO registradas (última 20260615000003); conteos 103/103/10 exactos; verify oficial = 18/18 FALLOS (pre-fix confirmado). Defecto menor de mi artefacto T-0 §3 documentado (columnas view_schema/view_name inexistentes; subsanado con pg_views).
- FASE A EJECUTADA (6/6 OK): public_catalog_v/public_storefronts_v/public_variants_v (security_barrier) + GRANT SELECT a anon; sondas anon 200.
- HALLAZGO P0 DURANTE LA VENTANA (sondeo read-only de catálogo): Supabase default privileges otorgó ALL (INSERT/UPDATE/DELETE/TRUNCATE) sobre las vistas NUEVAS a anon/authenticated; vistas auto-actualizables con owner postgres (BYPASSRLS) → vía de ESCRITURA que esquiva el RLS de las tablas (defacement del catálogo público). CERRADO con REVOKE INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER a anon+authenticated (SELECT conservado; service_role intacto), alineado con la intención declarada de la Fase A ("SELECT SOLO a anon") y el estilo de casa (vale_salida.sql). Evidencia: sondeo_escritura_vistas_readonly.json + hardening_vistas_solo_select.json.
- FASE B EJECUTADA: reset --hard a 2be38e21b; checksums sha256 de los 3 artefactos CP-SEC-027 byte-idénticos a lo certificado en REV-3 (5c2b8f97…/bec0ae2e…/8c180c57…); bun install 1318 paquetes; pm2 start ecosystem.config.js --only costpro (pid 3720, online, .env 14 vars); / → 200. Humo: API + vitrina SSR enervida-vitallcons y puerto-padre-vitallcons 200/200 con catálogo real (85 productos vía vistas); Vercel TAMBIÉN recuperado (title "ENERVIDA-VITALLCONS — Catálogo de Productos") — el fallo 404 del D0 quedó corregido por la Fase A para local y producción.
- FASE C EJECUTADA (8/8 OK): DROP products_public_read_anon + stores_select_anon; policy de variantes recreada solo-authenticated (mismo predicado); REVOKE SELECT ×3 a anon. Post-checks: 0 policies anon; grants anon tablas = []; sondas anon tablas 401 y vistas 200.
- VERIFICACIÓN OFICIAL: cpsec027_post_migration_verify.js = 18/18 PASS, exit 0 ("fix CP-SEC-027 verificado en vivo"); humo post-C 200/200; pm2 save persistido (dump.pm2). allowedDevOrigins ya cubre *.space-z.ai (sin cambio de código necesario).
- PR DE RESPALDO: rama evidence/cp-sec-027-ventana-ejecucion-20261019 con evidencia completa de la ventana (docs/audits/evidence/20261019-cp-sec-027-ejecucion/), migración de seguimiento 20261019000002 (endurece vistas a SELECT-only de forma durable), scripts de ops de la ventana y snapshot del worklog; push y apertura vía API con el PAT entregado.

Stage Summary:
- Ventana completa ejecutada con éxito: P1 (exposición de costos por anon) CERRADO y vitrinas 404 RECUPERADAS (local pm2 + Vercel), 18/18 PASS en vivo.
- Hallazgo material nuevo: write-hole P0 vía default privileges sobre las vistas — cerrado en vivo y convertido en migración durable 20261019000002 para futuros entornos (revisar/merge por el propietario).
- Servidor reactivo bajo PM2 (app costpro, main 2be38e21b, puerto 3000, .env del propietario, process list guardado).
- Entregables: download/cp-sec-027-ejecucion-20261019/ (T-0, fases A/C, hardening, verify 18/18, humo) + PR de respaldo en GitHub.
