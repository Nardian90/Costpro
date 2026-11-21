# cycles/ — Informes de ciclo del programa CP-CI

Un informe por ejecución programada. Nombre: `cycle-<NNN>-<CP-CI-0XX>.md` (NNN = número de ciclo con 3 dígitos). Plantilla obligatoria:

```markdown
# Ciclo NNN — CP-CI-0XX — <título corto>
- **Fecha / hora (UTC)**: 
- **Agente / entorno**: (ZCode programado; workspace)
- **Repositorio al inicio**: rama, SHA, estado del árbol

## Misión seleccionada
- ID y archivo de backlog; **justificación de selección** (prioridad aplicada
  y por qué esta y no otra; reglas de PROGRAM.md §3 citadas)

## Fase B — Investigación (causa raíz)
- Archivos localizados, origen del problema, riesgos identificados

## Fase C — Plan
- Solución, criterios de aceptación, archivos delimitados, pruebas elegidas

## Fase D — Implementación
- Cambios realizados (lista por archivo), reutilización de código existente,
  decisiones con skills aplicadas (cuál y cómo influyó — no solo su nombre)

## Fase E — QA (resultados literales)
- Comando → resultado (PASS/FAIL, conteos). Etiquetas de evidencia E1–E4.
- Saldo ESLint antes → después (si aplica, contra ESLINT_BASELINE.json)

## Fase F — Antes / después
- Comparación (métrica, captura, comportamiento). Sin evidencia no hay certificación.

## Fase G — Git
- Rama, SHA(s), PR (URL real) o patch + limitación documentada. NUNCA merge.

## Certificación: APROBADA / APROBADA CON OBSERVACIONES / RECHAZADA / BLOQUEADA
- Justificación objetiva (evidencias, no opinión)

## Limitaciones y pendientes
- Lo que no se pudo verificar y por qué

## Estado (post-cierre)
- STATE.json actualizado: campos tocados; lock liberado; next_recommended
```

Reglas: sin secretos ni tokens; sin datos de producción; las evidencias visuales (capturas) se referencian por ruta temporal fuera del repo, no se commitean salvo petición del propietario; un ciclo "revisión sin cambios necesarios" también genera informe (sin incrementar misiones completadas).
