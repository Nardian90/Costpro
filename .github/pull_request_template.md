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

## Reglas de negocio afectadas (CP-BRA-001)

<!-- Obligatorio si el PR modifica dominios críticos (finanzas, POS/ventas,
     inventario, compras/servicios, datos maestros, migraciones BD, contratos
     de seguridad). Declare los IDs del catálogo
     docs/quality/business-rules/BUSINESS-RULES-CATALOG.md (p. ej. FIN-002,
     POS-001) o escriba: NINGUNA — <justificación breve>.
     Si introduce o modifica una regla empresarial, actualice el catálogo y
     añada prueba positiva + negativa (STANDARD-CP-BRA-001.md §17). -->

- Reglas afectadas:
- Reglas nuevas o alteradas (con actualización de catálogo + trazabilidad):

## Checklist

- [ ] Clasificación de riesgo justificada según `.github/PULL_REQUEST_TEST_POLICY.md`
- [ ] Pruebas obligatorias ejecutadas con evidencia en la sección Testing
- [ ] Reglas de negocio declaradas según CP-BRA-001 (o NINGUNA justificada)
- [ ] No se trabajó directamente sobre `main`
