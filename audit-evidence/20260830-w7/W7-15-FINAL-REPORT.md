# W7-15 — FINAL REPORT · MIGRATION READINESS REVIEW

Fecha: 2026-08-30 · Modo: READ-ONLY sobre producción · Ejecución real solo en clones efímeros locales (PostgreSQL 17.11, 127.0.0.1:5433, todos destruidos al cierre).

## 1. Resumen ejecutivo

Se revisó la madurez del paquete de remediación `w62-remediation/sql/01..09` (DF-01..09) para convertirse en migración segura de producción. Trece de catorce gates técnicos en verde, con un único defecto bloqueante de ACL (W7-D1) concentrado en un objeto y corregible con una línea. El paquete NO está autorizado para despliegue en su estado actual.

## 2. Cuadro final de gates (formato canónico del dueño)

```text
BASELINE ............... PASS   (HEAD==origin/main==b7b9dec; tree limpio; tags W6/W6.1; manifiestos 237/237 y 9/9; snapshot v6 351efa11…f3af EXACT)
S1 ..................... PASS   (re-ejecutado 2×: SHA 9e7cea9a596de6f4aa96c353cdd4f743f574958767f211a21c8857c5cf19edc2 == baseline producción; DIFF=0)
DF-01 WAC SINGLE WRITER  PASS   (15 escritores→1; guard activo; motor B eliminado; ADV-A9 bloqueado) [nota W7-D1 en ACL del motor]
DF-02 COGS SERVER-SIDE . PASS   (veneno 7777 sin efecto; COGS=WAC bajo FOR UPDATE; 5/5 ventas concurrentes)
DF-03 DEVOLUTION FINANCE  PASS  (contra-asiento cash/ledger; ref_type_check+direction; I1 netea refunds)
DF-04 HISTÓRICOS ....... PASS   (design-only; clasificador 8/8; cero backfill; T_canon pendiente del dueño W8)
DF-05 PRODUCCIÓN ....... PASS   (PT cost = consumo real server; cliente sin autoridad; partial OK)
DF-06 TRANSFER E-T ..... PASS   (blend destino exacto 77.142857; reversa simétrica; conservación 1000=700+300)
DF-07 DEVOLUTION CAP ... PASS   (lock venta→lectura→tope; race 4+4 → 1 acepta, ≤5)
DF-08 CLOSE UUID ....... PASS   (uuid=uuid; replay re-emite; param_hash rechaza reuso)
DF-09 OVERLOAD GOVERNANCE  PASS (PGRST203/is-not-unique eliminados; transición legacy→deprecated→v3 completa)
ACL .................... FAIL   (W7-D1: fn_recalc_wac EXECUTE a PUBLIC+anon+authenticated — W7-03 §12.2)
DEPENDENCIES ........... PASS   (grafo re-derivado de catálogos: 35 callers, 0 dependientes ocultos, orden 01→09 válido)
BACKWARD COMPAT ........ PASS   (clasificación completa CLIENT_OLD/CURRENT/NEW; 3 BREAKING controlados documentados — sin breaks ocultos)
MIGRATION ORDER ........ PASS   (PRECHECK→01..09→ASSERT; atomicidad por paquete; duración <1min + scan pkg 08)
FAILURE INJECTION ...... PASS   (11/11 EXPECTED==ACTUAL; 0 filas huérfanas; INV-12 hash idéntico)
ROLLBACK ............... PASS   (POST_ROLLBACK == PRE_MIGRATION byte a byte, SHA 989ca3a3…; irreversible solo lo documentado)
CONCURRENCY ............ PASS   (ventas 5/5; transferencias 8+8; withdraws 4+4; venta+recepción WAC-stale — todos serializados)
VALUE CONSERVATION ..... PASS   (ΣCOGS−Σuc×qty = 0 exacto; COGS_revert==COGS_original; A1 materializada 49.019608 trazable)
INV-01..15 ............. PASS   (34/34 asserts en clon limpio; INV-12 rollback hash-idéntico)
ADVERSARIAL ............ PASS   (15 ataques: 12 secuenciales + 3 concurrentes; 0 ACCEPTED-INCORRECTLY)
STOCK ZERO ............. PASS   (decisión: WAC RETAINED; blend S=0 ⇒ re-seed exacto; sin comportamiento incidental)
SYNC STOCK ............. PASS   (con hallazgo MEDIUM propio: divergencia caché↔ledger con created_at tie; ruta RPC inmune; WAC jamás tocado)
SONAR .................. PASS   (no contactado — estado documentado heredado de W6.1, sin cambios)

PRODUCTION MUTATIONS = 0   (0 conexiones fuera de 127.0.0.1:5433; toda la ejecución en clones efímeros destruidos)
GIT COMMITS = 0            (HEAD == b7b9dec al inicio y al cierre)
GIT PUSH = 0               (origin/main == b7b9dec; sin operaciones de red)
TREE LIMPIO = SÍ           (git status --porcelain = 0 líneas)

BLOCKER = 1  (W7-D1) · HIGH = 3 (F-C, H3, H6) · MEDIUM = 5 (F-A, F-B, H1, H2, SYNC) · LOW = 4
Desviaciones de proceso = 2 (P-1: 4 evidencias W6.2 sobrescritas por re-run — cadena rota 10/14; P-2: log de rollback vacío, cubierto por fingerprints)
```

## 3. Veredicto

```text
FINAL VERDICT: NO-GO
REASON: W7-D1 — el paquete 01 deja `fn_recalc_wac` (escritor único del WAC) ejecutable por
        anon/authenticated vía PUBLIC; mutación arbitraria de WAC reproducida en laboratorio
        (WAC 100 → 399.6666667 con llamada autenticada directa). Criterio NO-GO «ACL ambiguity»
        del dueño + violación de la promesa DF-01.
NEXT GATE: enmienda del dueño al paquete 01 (UNA línea):
           REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)
             FROM PUBLIC, anon, authenticated;
           → re-ejecutar SOLO el gate ACL (FASE 12) + INV-13 sobre clon limpio
           → si verde, re-gate para GO. No desplegar mientras W7-D1 esté abierto.
```

## 4. Condiciones registradas para el despliegue (cuando W7-D1 esté cerrado)

1. PRECHECK vivo P1-P6 (W7-05 §14.2) — especialmente P2: medir volumen real de `payment_transactions` antes del ALTER TABLE de pkg 08 (el snapshot 20260828 es solo-esquema).
2. Ventana coordinada DB↔frontend: `withdraw` (L26), `devolutions` con USE_V2_REVERSE=false (L73) y `reset` (L170) quedan rotas hasta W8 (breaking deliberado, error limpio, sin corrupción).
3. `NOTIFY pgrst, reload schema` tras pkg 04.
4. Rollback en producción exige exportar primero filas de devolución post-migración y `wac_change_log` (W7-06 §16.4).
5. Decisión del dueño sobre pkg 09 (desplegar como diseño auditable vs retener) y sobre el rediseño de `reset_store_data` (F-C, W62-10 §9.5).
6. Job de reconciliación `stock_current` vs `inventory` (W7-10 §20.3) hasta la fix determinista del tie en W8.

## 5. Entregables y custodia

`W7-00..W7-15` + `SHA256SUMS` en `w7-readiness/` (fuera de Git, sin commits). Evidencia cruda en `w7-readiness/tmp/` (clones destruidos; bases restantes: v2 pristine, v3 template, postgres). La cadena de custodia W6.2 quedó 10/14 por la desviación P-1 (documentada en W7-14 §24.2) — los 4 archivos afectados contienen re-ejecuciones frescas de las mismas suites y sus SHAs actuales están registrados en el `SHA256SUMS` de W7.
