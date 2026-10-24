# CP-MONEY-002 · Runbook de la ventana productiva (PREPARADO — NO EJECUTADO)

> Documento operativo para el responsable autorizado. Ningún paso de este runbook ha
> sido ejecutado contra producción por el agente. Todo lo previo a la ventana está
> validado en PostgreSQL 18 aislado (evidencia en `docs/audits/CP_MONEY_002_POSTMERGE_AUDITORIA_2026-10-24.md`
> §9.3, §10.4, §10.5). Última observación productiva de solo lectura: **2026-10-24T02:32:49Z**
> (firma viva `/31`, PGRST202 vivo, companion SIN aplicar).

## 1. Precondiciones y versión exacta del código

- [ ] `main` contiene el merge de #1469: `dd5aedc9f32374fcac58502c2438ef868fc07485` (verificado 2026-10-24T02:23:29Z, merged by Nardian90).
- [ ] **PR #1471 (D5-ACL) fusionado** y `main` en el SHA resultante de ese merge. El runbook NO debe ejecutarse con la companion sin su REVOKE de paridad: tras aplicar `20261025120000`, el check en vivo `secdef_public_grant` marca CI ROJO hasta aplicar `20261025130000`.
- [ ] Vercel: el deployment de producción apunta al SHA de `main` que contiene ambos (ver punto 3).
- [ ] Ventana de mantenimiento sin operaciones de caja activas (turnos cerrados o sin ventas en curso).
- [ ] Backup / restore point de la BD Supabase (Point-in-Time Recovery operativo) verificado ANTES de empezar.
- [ ] Acceso de solo lectura a `pg_proc`/`pg_default_acl`/`pg_depend` para las verificaciones (Management API o SQL editor como `postgres`).

## 2-3. Confirmaciones de estado (lectura)

#1469 está fusionado (verificado). El despliegue debe verificarse así:

```sql
-- en la app desplegada: /api/health o inspectar el deployment de Vercel por SHA
-- (el SHA del deployment == SHA de main que contiene dd5aedc9 y el merge de #1471)
```

```sql
-- verificación previa en la BD (SOLO LECTURA) — estado esperado HOY:
SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args, md5(pg_get_functiondef(p.oid)) AS md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_sale_v2';
-- ESPERADO: 1 fila, 31 params, SIN p_payment_components, md5 e25a939d…

SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE '%usd%rate%';          -- ESPERADO: 0

SELECT count(*) FROM pg_depend d
WHERE d.refobjid=(SELECT p2.oid FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid=p2.pronamespace
  WHERE n2.nspname='public' AND p2.proname='create_sale_v2')
  AND d.classid='pg_proc'::regclass AND d.deptype='n';            -- ESPERADO: 0 (sin dependencias duras)
```

**Criterio de PARADA temprana:** si `create_sale_v2` no tiene exactamente 1 firma de 31 params, o hay dependencias duras (>0), NO aplicar nada y documentar el estado real (prevalece la evidencia).

## 4-5. Orden EXACTO de migraciones y checksums

Aplicar en ESTE orden, consecutivos, en la MISMA ventana:

| # | Archivo | sha256 |
|---|---|---|
| 1 | `supabase/migrations/20261025120000_cp_money_002_postmerge_integrity.sql` | `c75a31fb03f66c0157de0454929b9b96f2f4b16e56d20b91b94ce79834c68521` |
| 2 | `supabase/migrations/20261025130000_cp_money_002_acl_revoke_anon.sql` | `939110100d960be7bc61893c81152a8d3219ce08a3622e108c5b70acb512eb7b` |

Verificar el checksum ANTES de aplicar (`sha256sum <fichero>` debe coincidir EXACTAMENTE). Si difiere, parar: el fichero cambió respecto al auditado.

- **NO aplicar** `20261024150000` (la de #1467): sobre la /31 viva aborta 42725 y no aporta nada (§9.2 del informe); la companion es auto-suficiente.
- Ambos ficheros son transaccionales por fichero en los runners estándar (`supabase db push`, SQL editor completo, psql por fichero). Si el runner aplicara statement-a-statement (no transaccional), el estado resultante queda igualmente cubierto: re-ejecutar ambos ficheros completa la convergencia (estados 5a/5b de §10.4, 31/31).
- Cada fichero termina con `NOTIFY pgrst, 'reload schema'` → PostgREST recarga el caché; si se aplica vía SQL editor de Supabase, confirmar la recarga (el NOTIFY corre en la misma sesión del editor; en caso de duda, `NOTIFY pgrst, 'reload schema';` manual tras el fichero 2).

## 6. Aplicación controlada (responsable autorizado — no el agente)

Aplicar cada fichero COMPLETO (copiar el contenido íntegro del fichero del repo en el SHA auditado — no fragmentos). Tras cada fichero, ejecutar las verificaciones del punto 8 antes de continuar.

## 8. Verificación posterior (SOLO LECTURA)

```sql
-- a) firma ÚNICA de 32 params (sin PGRST202/203 posible)
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_sale_v2';          -- ESPERADO: 1
SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_sale_v2';          -- ESPERADO: termina en 'p_payment_components jsonb'

-- b) SECURITY DEFINER + search_path intactos
SELECT p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_sale_v2';           -- true / {"search_path=public, pg_temp"}

-- c) ACL de paridad H0R: SIN anon, SIN PUBLIC
SELECT p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_sale_v2';
-- ESPERADO: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
SELECT has_function_privilege('anon','public.create_sale_v2(uuid, uuid, jsonb, text, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, numeric, uuid, text, uuid, text, timestamp with time zone, uuid, text, jsonb, text, text, jsonb, numeric, numeric, numeric, numeric, text, jsonb)','EXECUTE');
-- ESPERADO: false
```

## 9-10. Regeneración del surface y retiro de la baseline temporal

Solo cuando 8a–8c estén VERDES y el smoke del punto 11 pase:

1. `node scripts/export-contract-surface.cjs` — el surface debe certificar `public.create_sale_v2/32` (la firma nueva) y dejar de certificar la /31 (la companion la retiró del stream).
2. **Retirar la entrada `source_of_truth_baseline` de `create_sale_v2/31`** en `ci-gate-allowlist.json` (añadida por e91ed0c, expira 2027-01-31). Mismo mecanismo del precedente f53ab605 (retiro de `BODY_DRIFT` tras la aplicación autorizada) y del propio procedimiento §9.6.5.
3. El PR #1470 (abierto) conflicúa en esa región del allowlist: su resolución debe PRESERVAR la entrada de `create_sale_v2/31` hasta este paso, y retirarla después junto con las suyas cuando su propia correctiva se aplique.
4. CI en `main` debe quedar 100% verde (incluido `Security Audit` — que deja de necesitar la baseline — y `SQL DB Security Checks` con `secdef_public_grant` verde).

## 11. Smoke funcional (staging→prod; pasos 2–10 del §6 del informe)

En orden, cada uno con la app desplegada del SHA auditado:

1. **Venta CUP pura legada** (31 claves, sin desglose): completa; ledger 1 fila cash CUP @rate 1.
2. **Venta mixta 5 USD + 15 000 CUP** (producto 10 USD × 2, tasa del día): completa; ledger 2 filas (USD @tasa, CUP @1); Reporte Entrega: unidades en el reporte predominante y el componente monetario en el secundario con 0 unidades.
3. **12 USD + 8 000 CUP**: predomina USD; 8 USD + 2 000 CUP sin incidencia → rechazo limpio (ERR_PAYMENT_MISMATCH), sin venta parcial.
4. **Sobrepago con vuelto** (recibido 25 USD, vuelto en CUP a tasa del día): liquidación D6; el vuelto NO aparece como ingreso.
5. **Duplicado/reintento** de la misma venta (misma idempotency_key): `idempotent`, misma transacción, cero filas duplicadas.
6. **Reversión de una venta de prueba** (reverse_transaction_v2, rol admin/manager): existencias restauradas una vez; el Reporte Entrega la excluye (`status` ≠ completed).
7. **Cuadre por moneda** del libro de caja con el arqueo físico por moneda (misión caja).

## 12. Criterios de PARADA y recuperación

Detener la ventana (no continuar, documentar, evaluar rollback) si CUALQUIERA de:

- El checksum de un fichero no coincide con la tabla del punto 4.
- La firma viva no es exactamente 1 de 31 params en la verificación previa.
- Cualquier error de dependencias al aplicar (está el backup; nada habrá mutado por transaccionalidad — verificar con la consulta a).
- 8a ≠ 1, 8b sin `search_path`, o 8c con anon/PUBLIC tras el fichero 2.
- Cualquier fallo del smoke 1–3 (ventas rotas = parada inmediata).

**Recuperación:**

- Re-ejecución inofensiva: ambos ficheros son idempotentes; un estado interrumpido (runner no transaccional) se completa re-ejecutando el fichero afectado (estados 5a/5b, §10.4).
- Rollback de esquema: restaurar el backup/PITR de la ventana (forward-only: el repo no incluye migraciones inversas por política; una inversa `DROP /32 + CREATE /31` desde el historial del repo es posible pero debe versionarse como nueva migración y solo con decisión del propietario).
- Rollback de código: desplegar el SHA anterior de main en Vercel (las ventas puras funcionan en ambos estados de firma; los mixtos quedarían 503 accionable si la BD migró y el código retrocede — evitar esta combinación; preferir rollback conjunto).

## Evidencia disponible de las pruebas previas a la ventana

- PostgreSQL 18 aislado: 44/44 batería semántica (D1/A–J/D3/tenant/PT011) + 31/31 Fase C (5 estados + D5 + fix) + 6/6 Fase F (reversión modelo vigente) — JSON en `/home/z/my-project/pgiso/results/`.
- Suite TS: 3730/0 (247 archivos, 49 skip de integración-SQL/E2E por política).
- CI PR #1471 head `022e596e`: 8 checks verde. CI merge #1469 `dd5aedc9`: 8 checks verde.
