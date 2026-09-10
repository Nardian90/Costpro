# 14_CONCURRENCY — §16 (raw: t3_concurrency_out.txt) — ALL PASS

Conexiones paralelas reales (Management API, cada llamada = conexión/txn propia,
simulación exacta del path HTTP: SET LOCAL ROLE service_role + claims + p_user_id server-side).

## Transparencia de iteración
1ª corrida: harness con ROLLBACK final en las llamadas paralelas (patrón copiado de t2) →
las txn corrían y se revertían (ok=2 con estado final vacío). Artefacto del harness,
NO de concurrencia. Corregido a COMMIT; periodos frescos 2029-04/05/06.

## Resultados definitivos
- **C-A (2 CLOSE paralelos, periodo nuevo 2029-04)**: exactamente 1 exitoso; el otro falla
  con 23505/ERR_PERIOD_LOCKED (en esta corrida: 23505 unique; en la corrida previa
  ERR_PERIOD_LOCKED — ambas clases canónicas observadas, siempre UN solo ganador) →
  1 fila closed · auditoría: exactamente 1 CREATED, record_id = fila única, actor ok.
- **C-B (2 LOCK paralelos sobre closed 2029-05)**: 1 exitoso, 1 ERR_NOT_CLOSED →
  1 fila locked · auditoría: 1 CREATED + 1 UPDATED:locked, uuid = fila única, actor ok.
- **C-C (CLOSE vs LOCK paralelos sobre open 2029-06)**: ambos exitosos en orden serializado
  (close committed primero, lock después) → estado final 'locked' (válido); auditoría
  CREATED:open(ensure) + UPDATED:closed + UPDATED:locked — misma fila única, sin duplicados,
  sin estados imposibles (lock jamás precede a su close; verified por orden de audit rows).

Veredicto: un único estado válido por periodo; sin race corruption; sin doble auditoría;
sin estados imposibles; sin mezcla de UUIDs.
