## Resumen

<!-- Qué cambia este PR y por qué (2-4 líneas) -->

## Testing

> Clasifica según `.github/PULL_REQUEST_TEST_POLICY.md`. El agente no puede
> omitir una suite solo porque considera el cambio pequeño: debe justificar
> la clasificación conforme a la política.

- Risk: LOW / MEDIUM / HIGH / CRITICAL
- Required E2E: <!-- specs ejecutados (p. ej. e2e/inventory.spec.ts) o "Ninguna requerida" -->
- Full E2E required: YES / NO
- Required tests executed: <!-- comandos + resultado (o "satisfechos por CI: quality/unit-tests") -->
- Blockers: <!-- "Ninguno" o detalle + clasificación (FLAKY/INDETERMINATE/PREEXISTING con evidencia vs main@SHA) -->

## Checklist

- [ ] Clasificación de riesgo justificada según `.github/PULL_REQUEST_TEST_POLICY.md`
- [ ] Pruebas obligatorias ejecutadas con evidencia en la sección Testing
- [ ] No se trabajó directamente sobre `main`
