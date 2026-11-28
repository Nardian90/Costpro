# SECURITY-DESIGN.md — Modelo de seguridad correcto
## Misión CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001 · FASE 3-4

## 1. Modelo de datos → modelo de seguridad

La tabla es un **snapshot global de catálogo de mercado** (1.607 cotizaciones BCC/elToque/Diviza, segmentos 1/2/3 = segmentos BCC, **sin dimensión tenant**, sin user_id, sin store_id) con un patrón de acceso asimétrico:
- **Escritura**: exactamente un canal legítimo (el canal gobernado del repo vía Management API, ya ejecutado; por diseño la tabla es de solo-lectura tras su creación).
- **Lectura**: cero consumidores de aplicación; solo procesos privilegiados de operación (sondeo, verificación de rollback, gate CI).

La misión exige no imponer per-store si el dato no es multi-tenant — verificado: **no lo es** (opción C descartada por el esquema y la finalidad).

## 2. Comparación de alternativas

| Alternativa | Encaje con el uso real demostrado | Veredicto |
|---|---|---|
| **A. Exclusivamente privada** — sin acceso directo anon/authenticated; lectura/escritura solo por procesos privilegiados | Encaje EXACTO: cero consumidores de app; el único lector/escritor legítimo es el canal Management API (postgres) y service_role (plataforma). El congelamiento es parte del diseño (rollback artifact). | **ELEGIDA** |
| B. Privada + API/RPC controlada | Añadiría superficie (función expuesta, validación de origen/formato/fecha, registro de actualizaciones) para satisfacer a **cero consumidores existentes** — la misión exige no crear capacidad de manipulación innecesaria: un RPC de escritura sobre un artefacto que por diseño no recibe escrituras contradice su finalidad. Un RPC de lectura tampoco tiene demanda (la app usa `exchange_rates` viva). | Descartada |
| C. Acceso por tenant | Inaplicable: sin tenant en el esquema; el dato es de mercado global. | Descartada |

## 3. Diseño elegido (opción A) — mínimo privilegio con defensa en profundidad

1. **RLS habilitada, CERO policies** — deny-all para cualquier rol no propietario sin bypassrls. Prohibido expresamente resolver con `USING(true)`/`WITH CHECK(true)` (no se crea ninguna policy: el hallazgo se resuelve, no se disfraza).
2. **REVOKE ALL a anon, authenticated y PUBLIC** — elimina los privilegios heredados de los default privileges de Supabase. Dos barreras independientes: si una futura operación desactivara RLS, anon seguiría sin permisos (y viceversa).
3. **service_role conservado** — default de plataforma para todo proceso privilegiado server-side (clave secreta, jamás pública, jamás en frontend/repo: verificado). Es el canal del workflow de captura y de futuros procesos server-side; revocarlo desviaría del estándar del resto del schema sin ganancia real (service_role ya bypassa RLS).
4. **Sin `FORCE ROW LEVEL SECURITY`** — el canal legítimo (Management API, rol postgres = owner) debe seguir operando para sondeos/rollback; FORCE rompería ese canal y no aporta (nadie más tiene grants).
5. **Datos históricos intactos** — la migración no contiene DML; conteo y hash de contenido se verifican PRE→POST idénticos (1.607 filas, md5 `4c151b16…`).
6. **Auditoría de actualizaciones** — para un artefacto sin escritor, el mecanismo de vigilancia es: (a) el gate CI en vivo `tables_no_rls` (falla si RLS se desactiva en CUALQUIER tabla); (b) la atestación de contenido (hash md5) re-ejecutable del sondeo forense; (c) pg_stat (upd/del ≠ 0 delataría escrituras). Un trigger de auditoría de filas añadiría superficie a una tabla que no debe recibir writes y cuya mutación ya está doblemente bloqueada.
7. **Documentación en el catálogo** — `COMMENT ON TABLE` con origen, propósito, misión, prohibición de DROP sin autorización del propietario.

## 4. Preservación del proceso legítimo (FASE 4 de la misión)

- **El proceso de actualización de tasas NO se debilita**: el cron (workflow GitHub Actions 2×/día) escribe `exchange_rates` VIVA vía service_role y **no toca el respaldo** (verificado en código). La migración 20261128173000 tiene **cero referencias** a `exchange_rates` viva (test contractual estático).
- **El escritor del respaldo (canal gobernado fx-apply-recovery.mjs) queda endurecido en su origen**: el bloque DO del script ahora aplica la postura completa (RLS + REVOKE) al crear el respaldo — una futura ejecución de `--apply` ya no puede dejar grants residuales. No se sustituyó ninguna clave por otra en cliente público: el canal sigue siendo Management API + service-role server-side.
- **El lector legítimo (service_role / Management API) conserva acceso** — demostrado en E2E (F6 lectura 200 con filas, F7 escritura 201: el canal de rollback sigue operativo).
- **Continuidad verificada**: la suite smoke E2E (pos-checkout, inventory, auth, isolation…) 88/88 verde tras la migración; el consumidor canónico de tasas de COSTPRO no cambia de fuente.

## 5. Decisión sobre eliminación (fuera de alcance ejecutivo)

La misión prohíbe `DROP`/`TRUNCATE` en producción sin autorización adicional. **Propuesta para el propietario** (no ejecutada): una vez cumplida la ventana de reversión razonable de CP-FX-001 (p. ej. 30 días tras el 2026-11-28) y dado que el dump JSON gemelo está versionado en el repo, la tabla puede archivarse/eliminarse con una misión expresa — la entrada de higiene resultante (CREATE→DROP net-zero) se formalizaría entonces. Mientras tanto: exclusivamente privada.
