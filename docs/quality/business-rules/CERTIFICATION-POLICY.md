# POLÍTICA DE CERTIFICACIÓN DE REGLAS DE NEGOCIO — CP-BRA-001
**Versión:** 1.0 · **Fecha:** 2026-11-26 · **Aplicabilidad:** todas las misiones, agentes y PRs de COSTPRO 4.

## 1. PRINCIPIO

**La compilación, el lint, los tests unitarios y el despliegue verde son requisitos técnicos necesarios, pero no constituyen por sí solos una certificación empresarial.** Una misión que altera reglas de negocio no está completa hasta que las reglas afectadas estén identificadas, probadas (positiva y negativamente) y trazadas.

Esta política NO certifica COSTPRO bajo ninguna norma ISO: adopta **prácticas** derivadas de OWASP BLS Cheat Sheet, ISO/IEC 25010:2023, ISO/IEC/IEEE 29119, ISTQB 4.0 y OMG DMN (ver STANDARD-CP-BRA-001.md §0).

## 2. ESTADOS DE CERTIFICACIÓN

**CERTIFICADO** — todas las reglas críticas del alcance están identificadas, protegidas (punto de imposición verificable server-side) y probadas (positiva, negativa, regresión). No hay defectos críticos abiertos en el alcance y existe evidencia reproducible (CI/E2E/artefactos con SHA).

**CONDICIONAL** — no hay defectos críticos demostrados sin control, pero existen reglas ambiguas pendientes de decisión del propietario, cobertura incompleta de pruebas negativas, o riesgos no críticos abiertos. La certificación CONDICIONAL enumera exactamente qué falta.

**RECHAZADO** — existe al menos UNA de estas condiciones: regla crítica incumplida, transición inválida permitida, contradicción empresarial entre módulos, o prueba crítica fallida.

**Reglas irrenunciables:**
- Nunca presentar como certificado un módulo que no fue realmente examinado.
- Nunca afirmar que «todo COSTPRO» está certificado si solo se cubrieron algunos dominios.
- Si no se puede identificar una regla, se declara; si no se puede probar, no se certifica; si hay contradicción entre módulos, se detiene la implementación afectada y se documenta el conflicto; si una regla depende de una decisión del negocio, se solicita esa decisión antes de inventar una interpretación.

## 3. CERTIFICADO DE ALCANCE (formato obligatorio)

Toda certificación (misión, módulo, PR) emite un certificado con estos campos:

```
CERTIFICADO DE REGLAS DE NEGOCIO — CP-BRA-001
Alcance:            <módulos/dominios realmente examinados>
Versión examinada:  <commit SHA exacto>
Reglas identificadas: <N> (referencia a BUSINESS-RULES-CATALOG.md §familia)
Reglas certificadas:  <N> · condicionales: <N> · pendientes: <N>
Defectos abiertos:    <IDs del RISK-REGISTER>
Pruebas ejecutadas:   <suites/e2e con resultado numérico y enlace de run>
Exclusiones:          <lo que NO se examinó, explícitamente>
Limitaciones:         <entorno, credenciales, datos, tiempo>
```

## 4. PROCESO POR MISIÓN (obligatorio desde la publicación de CP-BRA-001)

1. **Declaración previa:** la misión declara qué reglas del catálogo espera afectar (IDs) y qué reglas nuevas introduce.
2. **Diseño de pruebas:** para cada regla afectada: positiva + negativa + regresión (29119/ISTQB: tabla de decisiones para reglas con ≥3 condiciones; análisis de valores límite en montos/stock/fechas; pruebas de transición de estado).
3. **Ejecución:** las pruebas corren en CI o en la BD aislada (nunca producción como banco de pruebas — SYS-003).
4. **Trazabilidad:** actualizar la entrada del catálogo + fila de TRACEABILITY-MATRIX.md + evidencia en `docs/audits/<MISION>/`.
5. **Certificado:** emisión del certificado de alcance; si el PR toca reglas críticas RECHAZADAS abiertas, la misión no las «repara por colateral»: documenta el estado y referencia la misión de remediación.

## 5. PUERTA DE CERTIFICACIÓN EN PR (implementación v1)

- Plantilla de PR con sección **«Reglas de negocio afectadas»** (IDs del catálogo o «NINGUNA»).
- Gate `business-rules-gate` en CI (job `quality`): valida integridad del catálogo (IDs únicos, archivos de prueba referenciados existen) y, en PRs que tocan dominios críticos, exige la sección en el cuerpo del PR con IDs válidos o NINGUNA justificada. Fail-closed ante catálogo corrupto; fail-closed ante dominio crítico sin declaración.
- La puerta NO aprueba una regla por el nombre de un test: valida integridad estructural del catálogo y el registro explícito del PR; la validación semántica (que la prueba realmente ejercita la regla) sigue siendo humana + CI.

## 6. GESTIÓN DE DEFECTOS

- Todo hallazgo de auditoría entra al RISK-REGISTER con ID permanente.
- CRÍTICO: misión de remediación independiente con criterios, riesgos y pruebas propias; si existe vulnerabilidad activa sobre dinero/datos, contención prioritaria propuesta de inmediato.
- La corrección NO altera: operaciones históricas, saldos financieros, reversiones contables ejecutadas, consolidación de terceros, inventarios reales, reglas ambiguas sin aprobación, ni producción para «hacer pasar» una prueba.

## 7. GOBERNANZA DEL CATÁLOGO

- El catálogo es un archivo versionado en el repo (`BUSINESS-RULES-CATALOG.md`); toda regla nueva/alterada se documenta ANTES de considerar la misión terminada.
- Decisiones de negocio ambiguas se registran como `REQUIERE DECISIÓN` con opciones justificadas; el propietario decide; la decisión se anota en la regla con fecha y expediente.
- Revisión del catálogo: cada misión que toque su familia + revisión integral trimestral.

## 8. CERTIFICACIÓN DE ESTA MISIÓN (v1.0, auto-aplicación)

```
CERTIFICADO DE REGLAS DE NEGOCIO — CP-BRA-001 (misión CP-SAAS-BUSINESS-RULES-CERTIFICATION-001)
Alcance:            5 dominios examinados en profundidad (plataforma, finanzas, operaciones comerciales,
                    inventario/datos maestros, infraestructura de calidad) sobre main 0e684d6c1
Reglas identificadas: 72 (catálogo v1.0) · críticas auditadas en profundidad: 16
Reglas certificadas:  10 · condicionales: 3 · pendientes: 3 (R-11, R-01/02, R-05, R-15)
Defectos abiertos:    7 CRÍTICOS + 15 ALTOS + 5 MEDIOS + 3 BAJOS (RISK-REGISTER v1.0)
Pruebas ejecutadas:   gates estáticos locales (SQL/TS/writers/destructive) + suites existentes citadas;
                      NO se ejecutaron nuevas pruebas funcionales contra BD en esta misión documental
Exclusiones:          HR/nómina (solo inventario), WhatsApp/Telegram (no examinados), billing/Stripe,
                      cost-sheets AI, storefront; BD de producción (solo lectura de migraciones y repositorio)
Limitaciones:         auditoría estática de código + evidencia de expedientes previos; sin ejecución E2E nueva;
                      la certificación del SISTEMA GLOBAL queda CONDICIONAL
Estado del sistema global: CONDICIONAL — sin defecto crítico sin control documentado, pero con 7 defectos
                      críticos abiertos que impiden CERTIFICADO y exigen misiones de remediación independientes
```
