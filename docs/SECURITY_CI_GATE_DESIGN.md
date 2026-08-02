# Security CI Gate Design

**Fecha:** 2026-08-02
**Fase:** 10 — Security CI Gate & Hardening Continuo
**Estado:** Diseño (pendiente aprobación)

---

## 1. Objetivo

Evitar que futuras migrations o endpoints reintroduzcan los problemas de seguridad corregidos en las Iteraciones 7-9. El gate se ejecuta automáticamente en cada PR via GitHub Actions.

---

## 2. Checks Automatizados

### Check 1: SECURITY DEFINER sin auth check

**Qué detecta:** Funciones `SECURITY DEFINER` nuevas o modificadas que no validan `auth.uid()`.

**Query SQL:**
```sql
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND pg_get_functiondef(p.oid) NOT LIKE '%auth.uid%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%ERR_PERMISSION_DENIED%'
  AND p.proname NOT IN (
    -- Triggers (no invocables via PostgREST)
    SELECT proname FROM pg_proc p2
    JOIN pg_trigger t ON t.tgfoid = p2.oid
    WHERE p2.pronamespace = n.oid
  )
ORDER BY p.proname;
```

**Resultado esperado:** 0 filas (excluyendo triggers).

**Excepciones documentadas:** Funciones STABLE read-only que no modifican datos (ej: `validate_store_can_be_modified`) — deben tener `REVOKE FROM anon, PUBLIC` y estar listadas en `ci-gate-allowlist.json`.

### Check 2: Grants PUBLIC/anon

**Qué detecta:** Cualquier función en schema `public` con grant a `anon` o `PUBLIC` que sea `SECURITY DEFINER`.

**Query SQL:**
```sql
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants rg
    WHERE rg.routine_schema = 'public'
      AND rg.routine_name = p.proname
      AND rg.grantee IN ('anon', 'PUBLIC')
  );
```

**Resultado esperado:** 0 filas.

### Check 3: Tabla nueva sin RLS

**Qué detecta:** Tablas en schema `public` sin `rowsecurity = true`.

**Query SQL:**
```sql
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
  AND c.relname NOT IN (
    -- Tablas del sistema/extensiones
    SELECT extname FROM pg_extension
  )
ORDER BY c.relname;
```

**Resultado esperado:** 0 filas (todas las tablas con RLS).

**Excepciones:** Tablas temporales o de logging que no contienen datos de usuario — deben estar en allowlist.

### Check 4: Endpoint destructivo sin schema validation

**Qué detecta:** Endpoints con métodos POST/DELETE/PATCH que no importan o usan Zod.

**Validación TypeScript (grep):**
```bash
# Buscar archivos route.ts que no tengan z.object o z.enum
find src/app/api -name "route.ts" -exec grep -L "from 'zod'" {} \;
```

**Resultado esperado:** 0 archivos (todos los endpoints deben usar Zod).

### Check 5: Endpoint destructivo sin withRole/withAuth

**Qué detecta:** Endpoints sin middleware de autorización.

**Validación TypeScript (grep):**
```bash
# Buscar exports POST/DELETE/PATCH sin withRole o withAuth
find src/app/api -name "route.ts" | while read f; do
  if grep -qE "export (const|async function) (POST|DELETE|PATCH)" "$f"; then
    if ! grep -qE "withRole|withAuth" "$f"; then
      echo "MISSING AUTH: $f"
    fi
  fi
done
```

**Resultado esperado:** 0 archivos sin auth middleware.

---

## 3. Arquitectura del CI Gate

```
GitHub PR
    │
    ▼
GitHub Actions Workflow
    │
    ├── Job 1: SQL Security Checks
    │   ├── Conectar a DB de staging (o ejecutar migration en DB temporal)
    │   ├── Ejecutar Check 1 (SECURITY DEFINER sin auth)
    │   ├── Ejecutar Check 2 (grants anon/PUBLIC)
    │   ├── Ejecutar Check 3 (tablas sin RLS)
    │   └── Si cualquier check > 0 → FAIL
    │
    ├── Job 2: TypeScript Security Checks
    │   ├── Ejecutar Check 4 (Zod validation)
    │   ├── Ejecutar Check 5 (auth middleware)
    │   └── Si cualquier check encuentra issues → FAIL
    │
    └── Job 3: Allowlist Validation
        ├── Leer ci-gate-allowlist.json
        ├── Verificar que items en allowlist siguen siendo necesarios
        └── Reportar allowlist drift
```

---

## 4. Allowlist

Archivo: `ci-gate-allowlist.json`

```json
{
  "version": 1,
  "description": "Excepciones documentadas para el Security CI Gate",
  "security_definer_without_auth_check": [
    {
      "function": "validate_store_can_be_modified",
      "reason": "STABLE read-only function. No modifica datos. REVOKE anon/PUBLIC aplicado.",
      "added_by": "Iteración 9",
      "expires": "2026-12-31"
    }
  ],
  "tables_without_rls": [
    {
      "table": "pg_stat_statements",
      "reason": "Vista de extensión, no tabla de aplicación",
      "added_by": "Baseline",
      "expires": null
    }
  ]
}
```

Cada excepción debe tener:
- Nombre del elemento
- Razón documentada
- Quién la agregó
- Fecha de expiración (excepto permanentes del sistema)

---

## 5. Workflow CI

Archivo: `.github/workflows/security-gate.yml`

```yaml
name: Security CI Gate

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'src/app/api/**'
      - 'ci-gate-allowlist.json'

jobs:
  sql-security-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install supabase CLI
        run: npm install -g supabase
      - name: Start local Supabase
        run: supabase start
      - name: Apply migrations
        run: supabase db reset
      - name: Run SQL security checks
        run: node scripts/ci-gate-sql-checks.js

  ts-security-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run TS security checks
        run: node scripts/ci-gate-ts-checks.js
```

---

## 6. Scripts de Validación

### `scripts/ci-gate-sql-checks.js`

Ejecuta las 3 queries SQL contra la DB local de Supabase y falla si alguna retorna > 0 filas (descontando allowlist).

### `scripts/ci-gate-ts-checks.js`

Ejecuta los 2 checks de TypeScript (grep) y falla si encuentra endpoints sin Zod o sin auth middleware.

---

## 7. Ejemplos de Fallos Detectados

### Ejemplo 1: Nueva RPC sin auth check

```sql
-- migration: 20260901_new_function.sql
CREATE OR REPLACE FUNCTION public.delete_all_products(p_store_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM products WHERE store_id = p_store_id;
END;
$$;
```

**CI Gate resultado:**
```
❌ Check 1 FAILED: SECURITY DEFINER without auth check
   Function: delete_all_products(UUID)
   Missing: auth.uid() check
   Fix: Add auth check at the beginning of the function
```

### Ejemplo 2: Tabla nueva sin RLS

```sql
-- migration: 20260901_new_table.sql
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY,
  key TEXT NOT NULL
);
-- Missing: ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
```

**CI Gate resultado:**
```
❌ Check 3 FAILED: Table without RLS
   Table: api_keys
   Fix: ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
```

### Ejemplo 3: Endpoint sin Zod

```typescript
// src/app/api/stores/[id]/custom/route.ts
export async function POST(req: NextRequest) {
  const body = await req.json();
  // No Zod validation
  return NextResponse.json({ success: true });
}
```

**CI Gate resultado:**
```
❌ Check 4 FAILED: Endpoint without Zod validation
   File: src/app/api/stores/[id]/custom/route.ts
   Fix: Import and use z.object() for request body validation
```

---

## 8. Mantenimiento

- **Allowlist review trimestral:** Verificar que las excepciones siguen siendo necesarias
- **Nuevos checks:** Agregar checks según aparezcan nuevos patrones de riesgo
- **Documentación:** Cada check debe tener un ejemplo de fallo y fix en este documento

---

## 9. Estado

```
Diseño:                  ✅ Completo
Scripts:                 ⏳ Pendiente implementación
Workflow CI:             ⏳ Pendiente configuración
Allowlist:               ⏳ Pendiente creación
Documentación de uso:    ✅ Este documento
Ejemplos de fallos:      ✅ 3 ejemplos
```
