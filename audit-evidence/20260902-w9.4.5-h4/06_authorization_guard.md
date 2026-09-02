# W9.4.5 — H-4 | FASE 6 — EL GUARD PERDIDO Y SU RESTAURACIÓN

## Qué hacía v_caller_uid (versiones M1/M2/M3 del repo)
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
- Obtenía la identidad REAL del caller: para no-service_role forzaba auth.uid()
  (ignoraba p_user_id → imposibilitaba la falsificación de autoría);
  para service_role aceptaba p_user_id (inyectado server-side por /api/reverse
  con session.user.id) o auth.uid().
- Comparaba (junto a has_store_access_as en PR-4) la identidad contra la store del
  documento y RAISE 'ERR_UNAUTHORIZED' si no había acceso.
- Ataques que impedía: (a) reversión cross-store por usuarios sin membresía;
  (b) auditoría falsificada (audit_logs.user_id / reversed_by / created_by suplantados);
  (c) uso anónimo sin identidad.

## Demostración de explotabilidad de la viva
Estática (prosrc sin guard) + dinámica (probe alcanzó el cuerpo como authenticated).
Respuesta directa: SÍ — la viva puede invocarse con p_user_id != auth.uid() y
procesa la reversión usando ese p_user_id falsificado (ver 05_security_analysis.md).
Prueba de reversión real: NO EXECUTED — STATICALLY + PROBE PROVEN (regla del mandato).

## Restauración en la canónica H-4
- v_caller_uid idéntico al modelo M1/M2/M3 (probado en V1 desde siempre).
- + has_store_access_as(v_caller_uid, v_receipt.store_id) para TODOS los callers
  (incluido service_role: el p_user_id server-side debe tener acceso a la store —
  exactamente la semántica de V1). Usuario admin global pasa por design de
  has_store_access_as (rol admin → true).
- Todos los campos de auditoría (created_by, reversed_by, audit_logs.user_id)
  usan v_caller_uid, nunca p_user_id crudo.
