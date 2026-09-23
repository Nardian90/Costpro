# FASE C — C2 · 07 SECURITY (§22/§23)

## 1. Verificaciones de seguridad

| Verificación | Método | Resultado |
|---|---|---|
| RLS sin evasión (§22) | todas las operaciones E2E con JWT real de usuario (login Supabase); service role SOLO para censo de lectura (diagnóstico) | OK |
| anon sigue en 0 | probe GET sin JWT | 0 filas |
| UPDATE de documento ajeno (§23) | POST a la ruta real con `id` de FC de `bfcbc06d` usando JWT de `a1111111` | **404** — la fila queda byte-intacta (hash verificado) |
| UPDATE de FC PROPIO (D3) | POST a la ruta real con `id` de FC de `a1111111` | **409** `COST_SHEET_NOT_COMPATIBLE` — el writer se NIEGA aunque el owner podría; fila byte-intacta |
| `created_by` no suplantable | la ruta SIEMPRE usa `session.user.id` (JWT validado por Supabase); el cliente no envía created_by | OK (unit + E2E) |
| Policies RLS | cero cambios (git diff sin migraciones/SQL) | OK |

## 2. MODELO DE SEGURIDAD — constancia importante

RLS `cost_sheets_owner_manage` es **por fila** (auth.uid() = created_by), no por motor. El usuario de prueba `a1111111` es OWNER de 3 de los 7 documentos FC. Eso es CORRECTO según el modelo vigente (D1: global + ownership por fila; la pertenencia contractual se aplica en la capa de lectura/escritura de cada motor) y es precisamente por lo que C2 añadió el **guard D3 en el writer** (409): la seguridad (quién puede tocar qué) la da RLS; la coherencia contractual (qué puede tocar el editor CostSheet) la da el guard de compatibilidad. Ambas capas quedaron demostradas por separado en el E2E.

## 3. INCIDENTE DURANTE LA VERIFICACIÓN E2E — hallazgo, corrección y recuperación (transparencia total)

**Qué ocurrió (2026-09-23, primera ejecución E2E)**: el script de verificación (`fasec2-e2e.py` v1) contenía DOS defectos que, combinados, sobrescribieron y luego eliminaron un documento FC real:
1. El censo previo no tenía `ORDER BY` determinista, y el objetivo del "ataque" se tomaba como `fc_pre[0]` asumiendo que los 7 FC eran ajenos al usuario de prueba. En realidad `a1111111` (el usuario de prueba) es owner de 3 FC — el objetivo resultó ser `0024c883…` (FC propio, byte-idéntico a `6dd35833…` según la evidencia de C1R doc 04). El UPDATE con el id del propio usuario **sucedió** (RLS lo permite: es su fila) → el documento FC perdió nombre/categoría/datos.
2. La limpieza posterior por patrón de nombre (`ilike [C2-TEST]*`) eliminó también esa fila renombrada → el documento desapareció de la tabla.

**Qué NO ocurrió**: ningún otro documento fue tocado (los otros 6 FC + semilla conservaron hashes y timestamps; verificado). No hubo fuga de acceso: el update fue del owner sobre su propia fila (comportamiento RLS correcto). La causa fue íntegramente el script de prueba, no el código de producto implementado.

**Recuperación (íntegra, verificada)**:
- Base evidencial: C1R `doc 04` certificaba que `0024c883` era **byte-idéntico** a `6dd35833` (7229 bytes, mismo nombre, misma ráfaga de sync del 2026-09-21) y `6dd35833` permaneció intacto.
- Se recreó `0024c883` con el **mismo id** (`0024c883-e1c5-4ecf-bcde-1ace98a27c20`), mismo nombre («Ejemplo — Servicio de pintura y mantenimiento»), misma categoría (`FC Res148`), mismo `created_by` (a1111111), mismo `created_at`/`updated_at` (2026-09-21T11:27:52, de la fila gemela) y los datos byte-idénticos del donante. Operación ejecutada con el JWT del propio owner (INSERT válido por RLS).
- Verificación post-recuperación: censo **8 = 7 FC + 0 CS + 1 semilla**; par `0024c883`/`6dd35833` **byte-idéntico de nuevo**; hash global del conjunto FC restaurado. Script: `scripts/fasec2-restore-0024c883.py` → `fasec2-recovery-0024c883.json` (fuera del repo).

**Correcciones introducidas por el incidente (defensa permanente, no solo del script)**:
1. **Guard D3 en el writer** (`isCostSheetDocument` sobre el destino antes de UPDATE → 409): el producto YA NO PERMITE que un flujo del terminal sobrescriba un documento FC — ni siquiera a su propio owner. Cierra en código la clase exacta del accidente.
2. Script E2E v2 endurecido: ORDER BY determinista en todos los censos; objetivo de ataque filtrado por `created_by != UID` con re-afirmación dura; limpieza por **id exacto** (nunca por patrón); precondición de ausencia de residuos; verificación byte-a-byte de los 7 FC al final.

**Impacto residual**: para un cliente FC que tuviera la ficha `0024c883` en local, la fila restaurada conserva id, contenido y timestamps originales → su rev-check/hash comparará contenido idéntico (sin conflicto destructivo; el mecanismo de FC es no-destructivo por diseño: «(copia en conflicto)» en el peor caso). Los timestamps se restauraron con la precisión disponible (segundo, no microsegundos originales).

**Lección registrada para C2+**: toda prueba mutativa sobre datos reales debe (a) usar fixtures con id propio y limpieza por id, (b) nunca asumir la propiedad de filas sin leer `created_by`, (c) ejecutarse después de un `git diff` mental de qué guarda el writer. El veredicto de este gate incorpora el incidente como hallazgo resuelto, sin ocultarlo (mandato §23: «detener y documentar»).
