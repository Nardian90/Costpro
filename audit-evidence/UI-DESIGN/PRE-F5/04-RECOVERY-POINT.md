# PRE-F5 — 04 RECOVERY POINT (GATE 3 y 16)

Fecha: 2026-09-29

---

## 1. Punto de recuperación PRE-integración (creado ANTES de cualquier merge)

```text
$ git tag backup/pre-f5-main-09ef9e97 09ef9e97
$ git rev-parse backup/pre-f5-main-09ef9e97
09ef9e979699e886aafdf6c148bb00f7593d38d5
```

- Apunta EXACTAMENTE al HEAD real de `main`/`origin/main` antes de integrar.
- NO se ha borrado ni se borrará durante esta tarea (regla GATE 3).
- Se sube a origin junto con la integración (adición de ref, nunca force) para que el
  punto de recuperación sobreviva a reinicios del entorno — el motivo de ser de PRE-F5.

### Cómo restaurar (solo si F5 lo requiriera; NO es parte de esta tarea)

```text
git checkout backup/pre-f5-main-09ef9e97        # estado main pre-F3/F4
# o para inspección comparativa:
git diff backup/pre-f5-main-09ef9e97 main       # delta completo de la integración
```

## 2. Puntos de recuperación adicionales dentro de la operación

| Referencia | SHA | Significado |
|---|---|---|
| `origin/main` (inicio) | `09ef9e97` | base pre-integración |
| merge F3 | `9a534d96` | estado intermedio validado (GATE 9 completo) |
| merge F4 | `e45efb62` | estado integrado validado (GATE 11/12) |
| ramas certificadas originales | `60dd04ac` / `55b39920` | intactas en origin, sin tocar |

## 3. Integridad de los certificados originales

```text
$ git ls-remote origin refs/heads/audit/f3-states-overlays-feedback refs/heads/audit/f4-information-architecture
60dd04acdcbb41d00c41e1b4067f557b1d475a0f  refs/heads/audit/f3-states-overlays-feedback
55b399202684e7d3dd148f74883b0c6b31856472  refs/heads/audit/f4-information-architecture
```

Las ramas de auditoría NO se eliminan y NO se reescriben — permanecen como
evidencia independiente de los trabajos certificados F3 y F4.
