# FICHA DE DECISIÓN — BACKFILL `david9999` (DT-03): RATIFICAR O REVERTIR

**Expediente:** CP-SEC-027 v5 · Fase 4 · **Fecha:** 2026-10-21
**Regla del expediente:** el estado de la OPERACIÓN y el estado de su AUTORIZACIÓN se documentan SEPARADOS. No se buscan sustitutos artificiales de la autorización original (los comentarios del agente, commits o registros automáticos NO cuentan como autorización).

---

## 1. Estado de la OPERACIÓN — EJECUTADA y VERIFICADA VIVA

| Verificación (read-only, 21/10) | Resultado |
|---|---|
| `profiles.tenant_id` de `84ef824e-8066-4efa-afc7-102918c6c982` (david9999@gmail.com) | **`5364ccf8-e6cd-4c38-aea8-b167b3b5576f`** (Default Tenant) — valor esperado del dossier §3 |
| `updated_at` del perfil | 2026-10-19 18:29:50.876932+00 |
| Fila de auditoría `dt03_backfill_tenant` en `audit_logs` | **PRESENTE**, misma marca temporal exacta → UPDATE e INSERT atómicos en la MISMA transacción (dossier §5) |
| Idempotencia | Re-ejecución = 0 filas (guard `tenant_id IS NULL` ya no matchea) |
| Perfiles NULL restantes | 10 (los 10 sin evidencia de pertenencia NO fueron tocados — alcance de EXACTAMENTE 1 fila respetado) |
| Efecto sobre accesos del usuario | NINGUNO en modo latente (T3.1/T3.3 del informe DT-03: acceso legítimo a SU tienda conservado; sin extras) |

La operación se ejecutó conforme al dossier §5 (`scripts/dt03_backfill_david9999_execute.js`, doble bandera, transacción única) el 2026-10-19 18:29:50Z, tras dry-run 7/7 precondiciones PASS. Errata documentada en su momento: el UUID del prompt traía 13 caracteres en el último grupo; se usó el valor VIVO (12) — `raw/23_backfill_uuid_errata.md`.

## 2. Estado de la AUTORIZACIÓN — NO VERIFICABLE DE FORMA INDEPENDIENTE (razón de esta ficha)

Cadena documental de la autorización:
1. La instrucción operativa DT-03 §2.B (PR #1422) exigía: presentar fila exacta + valores + mecanismo de reversión y obtener **confirmación específica** antes de ejecutar.
2. El dossier (`BACKFILL_DAVID9999_DOSSIER.md`, 19/10) quedó ⛔ PENDIENTE DE AUTORIZACIÓN ESCRITA — **NO EJECUTADO** en ese momento (estado original del dossier).
3. La ejecución posterior (19/10 tarde) se realizó bajo la ratificación conocida como **D-3** (documentada en el informe de cierre de la Misión C: "ejecución con doble bandera (D-3 ratificado)").
4. **Esa ratificación D-3 vivió en la conversación operativa con el propietario** — el expediente v4/v5 determinó que la autorización ORIGINAL no es verificable de forma independiente HOY (la cadena es conversacional; el único rastro auditable persistente es la fila `dt03_backfill_tenant` con `authorized_by` en metadata).

Por la regla del expediente, el rastro en `audit_logs` y los commits del agente NO se consideran sustitutos de la autorización formal. La operación está hecha y correcta; la AUTORIZACIÓN queda como decisión pendiente del propietario. Esta ficha la pone sobre la mesa con exactamente DOS opciones.

## 3. Opciones de decisión

### OPCIÓN 1 — RATIFICACIÓN EXPRESA A POSTERIORI (recomendada)

El propietario revisa la evidencia disponible (§1 de esta ficha + dossier §1-§7 + informe de ejecución de la Misión C + verificación viva del 21/10) y ratifica formalmente la operación como autorizada. Cierre del expediente con un acta de ratificación (este repos responde "ratifico el backfill david9999" y el expediente se cierra con esa cita fechada).

- **A favor:** la operación es técnica y contablemente correcta; la pertenencia es demostrable (membership activa ENERVIDA → Default Tenant); es transaccional, auditada, idempotente y reversible; los efectos sobre accesos son nulos en modo latente; revertirla no corrige defecto alguno y reintroduce el único NULL clasificado como demostrable.
- **En contra:** ninguno técnico. Solo la disciplina formal (la ratificación es a posteriori).

### OPCIÓN 2 — REMEDIACIÓN CONFORME AL DOSSIER §6 (reversión exacta)

El propietario decide que la operación no queda cubierta y ordena restaurar el estado previo:

```sql
BEGIN;
UPDATE public.profiles
   SET tenant_id = NULL,
       updated_at = '2026-10-09 12:11:09.313885+00'::timestamptz
 WHERE id = '84ef824e-8066-4efa-afc7-102918c6c982'
   AND tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';
INSERT INTO public.audit_logs (...action='dt03_backfill_tenant_reversal'...);  -- dossier §6 verbatim
COMMIT;
```

- **Efecto:** `tenant_id` vuelve a NULL con el `updated_at` previo EXACTO; reversión auditada como evento propio; idempotente.
- **Consecuencia:** david9999 vuelve al conjunto de 11 perfiles NULL (clasificado "demostrable" en la matriz — un retroceso documental); el modo estricto de RLS futuro le retiraría el acceso legítimo a SU tienda (motivo por el que el backfill existía).
- **Recomendación técnica: NO** — no corrige ningún defecto; solo disciplina formal si el propietario así lo decide.

## 4. Qué queda PENDIENTE

| Decisión | Quién | Estado |
|---|---|---|
| Ratificar la operación (Opción 1) o revertir (Opción 2) | Propietario | **PENDIENTE DE DECISIÓN** |
| Cualquier ejecución derivada (acta de ratificación o reversión) | Agente, solo con orden expresa | PENDIENTE DE AUTORIZACIÓN |

**No se ejecuta NADA en esta ficha** — ni ratificación ni reversión — sin decisión expresa del propietario. Sin decisión, el estado persistente documental es: operación ejecutada correcta + autorización formal pendiente.
