# 06_RESIDUAL_RISKS — Problemas pendientes y riesgos aceptados

---

## 1. Riesgos residuales de la remediación

| # | Riesgo | Severidad | Mitigación existente | Decisión requerida |
|---|---|---|---|---|
| R1 | **La fecha real del borrado de los 72+10 padres es indeterminable.** El backfill marca con la fecha de primera detección certificada (2026-11-08, respaldo 20261108-0056); el comentario de columna lo documenta explícitamente. | Baja | Comentario de esquema + auditoría en `audit_logs`; el UUID del padre se conserva para trazabilidad | Ninguna (documentado) |
| R2 | **Las 18 referencias suaves `changed_by` apuntan a 17 perfiles irrecuperables** (identidad Auth eliminada físicamente, sin email/nombre/auditoría). Nunca se sabrá quiénes eran. | Baja | `check_data_integrity()` las expone como estado conocido; el UUID queda como evidencia | Ninguna (conservación R2; alternativa: NULL — **no recomendado**, destruye la última evidencia) |
| R3 | **Retirar las FKs duras de las tablas de snapshot** elimina una barrera (a cambio de parar la destrucción CASCADE del histórico). Un INSERT con triggers de validación desactivados (`session_replication_role=replica`) podría crear huérfanos nuevos. | Media | Triggers de validación BEFORE (23503) para toda vía normal; `check_data_integrity()` detecta `*_UNMARKED > 0`; la prueba estática impide reintroducir CASCADE | Operativa: incluir `check_data_integrity()` en el monitoreo/CI periódico |
| R4 | **Los triggers de marcado disparan por fila** en borrados masivos por cascada (coste O(n)). Con volúmenes actuales (73/10 filas) es irrelevante. | Baja | Ninguna necesaria hoy | Revisar si las tablas de snapshot crecen a decenas de miles |
| R5 | **El episodio de borrado masivo original no tiene responsable identificado.** La evidencia apunta a un reset estilo demo-reset con triggers off (posiblemente los scripts `DEMO_RESET_SCRIPT*.sql`/`reset_demo_data_pro.sql` ejecutados contra producción), pero no hay log que lo pruebe. | Media (gobernanza) | Los scripts siguen en el repo con `session_replication_role` — ver R6 | **Decisión del propietario**: restringir/eliminar los scripts de reset del repo o proteger su ejecución (solo E2E) |
| R6 | **Los scripts demo-reset pueden volver a fabricar huérfanos** si se ejecutan contra producción: truncan padres con triggers off y NO truncan las tablas de snapshot. | Media | La migración C los detectaría después del daño; no lo previene | **Decisión del propietario**: añadir las tablas de snapshot a la lista de TRUNCATE de los scripts, o retirarlos de `supabase/scripts/` |

## 2. Riesgos residuales de Storage / respaldo

| # | Riesgo | Severidad | Mitigación | Decisión requerida |
|---|---|---|---|---|
| R7 | **El respaldo 7z original (`costpro-respaldo-20261108-0056.7z`) NO contiene los 153 objetos anidados** (31 `stores` + 122 `reports`). El archivo original se dejó intacto (inmutabilidad de la corrida) y el addendum lo complementa. | Alta hasta adoptar el addendum | Addendum `costpro-respaldo-addendum-storage-20261108-0056.7z` (307 archivos, verificado por hash) + descargador corregido | **Acción del propietario**: guardar el addendum junto al 7z original Y su passphrase (§4); regenerar la corrida completa cuando el ciclo GFS lo permita |
| R8 | **La passphrase del addendum es nueva** (generada por el agente, mostrada una sola vez en el informe final de la sesión). Si no se guarda, el addendum es irrecuperable. | Alta | Se entrega en el informe + recomendación de moverla a gestor de contraseñas | **Acción del propietario**: guardarla FUERA del chat/la máquina; rotar cuando estime |
| R9 | **Las 21 rutas antes clasificadas R3 siguen en `storage.objects` sin referencia viva** (banners/logos/firmas/sellos de tiendas muertas + 2 archivos de test). Son filas legítimas con archivo físico; NO se borraron porque ya no hay justificación (no son fantasmas). | Baja | `reconcile_storage_metadata()` las lista (`rows_without_reference`) para una futura decisión informada | **Decisión del propietario**: si quiere limpieza estética del bucket, hacerla por Storage API con la lista del RPC (los archivos existen: la API sí puede borrarlos); NO es urgente ni afecta a la app |
| R10 | **La verificación física de Storage sigue siendo externa a la BD** (SQL no puede hacer HTTP). `reconcile-storage.mjs` la cubre pero no está en CI. | Baja | Script re-ejecutable + patrón documentado (HEAD público con ruta completa de la referencia) | Opcional: programarlo periódicamente |

## 3. Riesgo aceptado deliberadamente

- **No recrear los padres muertos** (72 reglas, 21 tiendas, ~72 workers, 17 perfiles): la reconstrucción sería inventar datos operativos (prohibido §2.5). Los snapshots conservados son la evidencia histórica suficiente.
- **Contador de huérfanos ≠ 0 al final** (18 referencias suaves + 72+10 marcados): la misión exige conservación histórica sobre cero inconsistencias — el estado final es 100 % trazable y verificado (0 huérfanos "desconocidos", 0 snapshots sin marcar, 0 pérdidas).

## 4. Secretos y credenciales (higiene)

- La passphrase del addendum y las claves usadas en esta sesión circularon por el entorno del agente. Recomendación (igual que en RESPALDO-COSTPRODB): guardar la passphrase en un gestor, fuera de la máquina/chat, y rotarla cuando el propietario lo estime.
- El PAT de GitHub usado para el PR ya rota por política del propietario (plantilla de inicio); no se almacenó fuera de `/tmp/.ghpat` (eliminable).

## 5. Resumen de decisiones pendientes del propietario

1. Revisar y fusionar (o rechazar) este PR — las migraciones quedan listas para aplicar tras el merge.
2. Guardar la passphrase del addendum (§R8) junto al respaldo.
3. Decidir sobre los scripts demo-reset en el repo (§R5/R6).
4. Opcional: limpieza estética de las 21 rutas sin referencia (§R9) y programación del verificador de Storage (§R10).
