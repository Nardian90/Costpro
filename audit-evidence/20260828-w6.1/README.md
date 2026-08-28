# WAC-DATAFLOW / W6.1 — COSTING CANONICAL DEFECT RESOLUTION / DECISION & PERSISTENCE GATE

Fecha: 2026-08-28 · Modo: RECUPERAR → VERIFICAR → CLASIFICAR → CORREGIR DOCUMENTACIÓN → VALIDAR → CONGELAR → COMMIT → PUSH
Producción: **READ-ONLY, cero mutaciones** · `costpro_audit_v2`: solo lectura (fingerprint post-fase = espejo intacto) · Código funcional: **NO modificado** · W7: **BLOQUEADO**

## Contenido

| Archivo | Propósito |
|---|---|
| `README.md` | este índice y reglas de la fase |
| `W6.1-VERDICT.md` | veredicto del gate + informe final de 16 puntos |
| `W6.1-DECISION-MATRIX.md` | D-01..D-12 (CURRENT TEXT/EVIDENCE/CONTRADICTIONS/AMENDMENT/OWNER?) + mapeo de IDs |
| `W6.1-DEFECT-REGISTER.md` | WAC-DF-01..09 con clasificación §6, call graph, server-side, históricos |
| `W6.1-INVARIANTS.md` | INV-01..14 revisadas + INV-15 formal (unidades/eventos/dependencias) |
| `W6.1-EVIDENCE-MANIFEST.md` | procedencia y hashes de todo el material usado/emitido |
| `60b-core-principles-and-fields.md` | revisión derivada (PR-1 con 14 escritores; R-6 matriz de bloqueos) |
| `61b-event-catalog.md` | revisión derivada (estado desplegado + aceptación W7 por evento) |
| `65b-sql-invariants-draft.sql` | revisión derivada (INV-06/07/08/10/13 enmendadas + INV-15) |
| `SHA256SUMS` | hashes congelados de esta carpeta |

## Reglas respetadas

```text
❌ producción (UPDATE/INSERT/DELETE/ALTER/DDL/RLS/credenciales/deploy) — INTACTA
❌ código funcional del repo — INTACTO (solo lectura para call graph)
❌ backfill / WAC histórico / cosmética — NO EJECUTADO
❌ documentos originales 59–67, 68–72, A–F — NO SOBRESCRITOS (revisiones 60b/61b/65b nuevas)
❌ W7 — NO INICIADO
✔ clones efímeros — NO requeridos en W6.1 (la evidencia de carrera F7 ya existía; no se repitió)
✔ verificaciones técnicas — solo SELECT de catálogo sobre costpro_audit_v2 + grep del repo
✔ toda recomendación técnica ≠ política contable (separadas en la matriz de decisiones)
```

## Estados de salida posibles (§18) — alcanzado

```text
W6.1 PARTIAL — OWNER DECISIONS PENDING
```
