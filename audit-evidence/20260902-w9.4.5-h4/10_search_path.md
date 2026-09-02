# W9.4.5 — H-4 | FASE 10 — SEARCH_PATH (reglas H-1)

| Estado | Valor | Evaluación H-1 |
|---|---|---|
| Viva (pre) | search_path=public, extensions | Explícito ✓ (cumple H-1); 'extensions' no requerido por el cuerpo (todas las referencias están cualificadas: public.*, auth.*, pg_catalog implícito) |
| Canónica H-4 | search_path=public, pg_temp | Explícito ✓, pg_temp al FINAL (best practice H-1/W9.4.3), coincide con M1/M2/M3 |

Justificación del cambio (independiente, dentro de H-4): uniformidad con las versiones
canónicas del repo y con el estándar aplicado por W9.4.3 a las 18 funciones SD;
elimina la dependencia innecesaria del schema extensions del search path.
Sin cambio funcional (el cuerpo no resuelve nombres en extensions).
