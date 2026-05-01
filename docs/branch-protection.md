# Configuración de Branch Protection — GitHub

## Reglas para rama `main` y `develop`

Configurar en GitHub → Settings → Branches → Add rule:

### main
- ✅ Require a pull request before merging
- ✅ Require approvals: 1 review mínimo
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require status checks to pass before merging:
  - code-quality
  - test-coverage
  - security-scan
  - build-check
- ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings

### develop
- Mismas reglas excepto: 0 approvals requeridos
- Status checks: code-quality, test-coverage

## Secretos requeridos en GitHub Settings → Secrets

| Secreto | Descripción |
|---------|-------------|
| `CODECOV_TOKEN` | Token de Codecov para subir reportes de cobertura |
| `E2E_BASE_URL` | URL del entorno de staging para E2E |
| `E2E_ADMIN_EMAIL` | Email del usuario admin de prueba |
| `E2E_ADMIN_PASSWORD` | Contraseña del usuario admin de prueba |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase (build time) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key de Supabase (build time) |

## Pipeline CI/CD — Resumen de Jobs

| Job | Descripción | Dependencia | Tiempo estimado |
|-----|-------------|-------------|-----------------|
| code-quality | TypeScript check + ESLint + console.log scan | — | ~2 min |
| test-coverage | Vitest con cobertura ≥80% | code-quality | ~3 min |
| security-scan | npm audit + TruffleHog + regresiones | code-quality | ~2 min |
| e2e | Playwright en staging (main/develop) | test + security | ~5 min |
| build-check | Build de producción + tsc --noEmit | test + security | ~3 min |

## Umbrales de Cobertura (vitest.config.ts)

| Ámbito | Líneas | Funciones | Ramas | Statements |
|--------|--------|-----------|-------|------------|
| Global | ≥80% | ≥75% | ≥70% | ≥80% |
| `src/services/**` | ≥85% | ≥80% | — | — |
| `src/lib/cost-engine/**` | ≥90% | ≥85% | — | — |
| `src/app/api/**` | ≥75% | ≥70% | — | — |

## Comandos útiles (local)

```bash
# Ejecutar tests
bun run test

# Tests con cobertura
bun run test:coverage

# Tests en modo watch
bun run test:watch

# Lint
bun run lint

# Análisis de bundle
bun run analyze
```
