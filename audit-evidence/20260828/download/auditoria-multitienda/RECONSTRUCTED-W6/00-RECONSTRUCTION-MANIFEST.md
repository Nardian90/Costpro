# 00 · MANIFIESTO DE RECONSTRUCCIÓN — W6-CANONICAL-DESIGN (RECONSTRUCTED-W6)

Fecha: 2026-08-28 · Autoridad: orden del dueño «R-RESTAURA» (ver `../RECOVERY-20260828/68-recovery-state-report.md`)

## Declaración de custodia — LEER PRIMERO

1. **NINGÚN archivo de este directorio es evidencia original.** Los originales de `WAC-DATAFLOW/W6-CANONICAL-DESIGN/` (docs 59–67) **se perdieron en el reinicio del sandbox del 2026-08-28**. Ese hecho es historia forense permanente y no se maquilla.
2. Cada archivo es una **RECONSTRUCTED-FROM-TRANSCRIPT**: copia literal desde la transcripción de la sesión donde los 9 documentos fueron leídos/redactados íntegros ANTES de la pérdida. Ningún fragmento fue inferido, completado ni embellecido.
3. La reconstrucción NO reabre W6 ni reemplaza su veredicto: es la recuperación del **contenido de trabajo** para que la cadena `RECONSTRUCTED W6 → HARNESS REBUILT → PARITY → CASES A–F → W6.1` pueda ejecutarse.
4. Los originales, de haberse recuperado copias auténticas (backup del dueño), **prevalecerían sobre estas copias** y estas quedarían marcadas como obsoletas.
5. Errata preservada a propósito (regla verbatim): `65-sql-invariants-draft.sql` contiene `grep禁忌` en el comentario INV-CP-NOFINANCIAL — así decía el original leído en transcripción; NO se corrigió.
6. Banner de procedencia: en `.md` como blockquote inicial; en `.sql` como bloque de comentarios; en `.json` como clave `_RECONSTRUCTED_FROM_TRANSCRIPT` (única alteración estructural declarada). El SHA-256 abajo incluye el banner.

## Tabla de hashes (SHA-256 del archivo reconstruido completo, banner incluido)

| Archivo | SHA-256 | Estado original |
|---|---|---|
| `59-design-input-facts.json` | `ae0490178d728e647236910e5b5145509c2b85ad01c55b6596fe5262a9e1df7e` | LOST 2026-08-28 |
| `60-core-principles-and-fields.md` | `bfe8fc03a896ceefa7ede35618ce04222b727af5a959367cb1829de252289570` | LOST 2026-08-28 |
| `61-event-catalog.md` | `04e1d2be8fa9db9142a17ec5d1fa0058599ec105fbcd580cb2fa010ccda9bd77` | LOST 2026-08-28 |
| `62-historics-policy.md` | `548e504c13dd1f468275c09a38eb63ae330dc6088af40d8b5aebc12c35521755` | LOST 2026-08-28 |
| `62-decision-register.md` | `78c7578991720b781c7fcbc686fe1b8c3f1c0f4d7c95fbb860c3d00a5ab7efdd` | LOST 2026-08-28 |
| `64-consumer-remediation-map.md` | `b660c9294cd78764972d6b44fd994709036c5cf07ac6265616b05bea1b3167c4` | LOST 2026-08-28 |
| `65-sql-invariants-draft.sql` | `2399f2fdec439e08a958d6cde7556360b3953b0bc0a165982a31ee05a7f6f2a8` | LOST 2026-08-28 |
| `66-gate-w6-verdict.md` | `fb1a796de5998f1275e1f97f0d856dbf039fa3d281828d0d57866dc72917ea47` | LOST 2026-08-28 |
| `67-w6-independent-critical-review.md` | `aa66becc4374d00d54b0c6ebe975286ca129dae48b0b99ccfe49daed923184bc` | LOST 2026-08-28 |

## Fragmentos no recuperables literalmente — INCONCLUSIVE/BLOCKED

- Ninguno en el cuerpo de los 9 documentos (todos fueron leídos/redactados íntegros en transcripción).
- PERDIDO SIN RECUPERACIÓN (fuera del alcance de esta reconstrucción, queda BLOCKED): W0–W5 artifacts completos (`EVIDENCE-SNAPSHOT`, `10-code-map-wac.json` con 368 hitos, defs verbatim W1, resultados W3/W4, `50-GATE-WAC.md`, DEFECT-REGISTER íntegro WAC-DF-01..07, freeze manifests). De ellos solo sobreviven resúmenes en transcripción — NO se reconstruyen por la regla «no inventar contenido ausente».
- Numeración: los originales ya tenían deriva 62↔63↔64 (registrada como CR-W6-8/higiene §4 del doc 67). La reconstrucción preserva los números y títulos TAL CUAL; la renumeración era precisamente una corrección pendiente de W6.1 y no se adelanta aquí.

## Cadena posterior autorizada por el dueño

```text
RECONSTRUCTED W6 (este directorio, congelado tras manifiesto)
   ↓
HARNESS REBUILT (PG 17 aislado + migraciones del repo + fixtures AUDIT_* nuevos)
   ↓
SCHEMA / RPC / TRIGGER PARITY   ── FAIL → STOP
   ↓
CANONICAL CASES A–F             ── FAIL → STOP
   ↓
W6.1 DOCUMENTAL (solo CR-W6-1/2/3/5, como enmiendas separadas — este directorio NO se edita)
   ↓
D-01..D-12 ratificables → nueva decisión explícita (W7 sigue requeriendo autorización propia)
```

Este manifiesto cierra la fase R-RESTAURA. Los archivos arriba listados quedan CONGELADOS a partir de la fecha del manifiesto.
