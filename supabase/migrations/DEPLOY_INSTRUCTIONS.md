Despliegue en staging — Instrucciones

Este documento explica cómo desplegar las migraciones creadas y ejecutar las comprobaciones SQL en un entorno staging.

Prerequisitos
- Tener `psql` instalado o acceso al SQL editor de Supabase.
- `DATABASE_URL` con permisos de superusuario para aplicar migraciones.
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` rotadas en caso de keys expuestas.
- (Opcional) `supabase` CLI instalada y configurada (`supabase login`).

Archivos a desplegar (orden recomendado)
1. `supabase/migrations/20260112_ensure_audit_rls.sql`
2. `supabase/migrations/20260112_register_stock_movement.sql`

Opciones de despliegue

A) Usando el SQL editor web de Supabase (GUI)
1. Abrir la consola de Supabase → SQL editor.
2. Copiar el contenido de `20260112_ensure_audit_rls.sql` y ejecutar.
3. Revisar errores; corregir y re-ejecutar si es necesario.
4. Ejecutar `20260112_register_stock_movement.sql`.

B) Usando `psql` (recomendado para CI/automación)
En tu entorno (Linux/macOS/Windows con Git Bash/WSL):
```bash
export DATABASE_URL="postgresql://user:password@host:5432/dbname"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260112_ensure_audit_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260112_register_stock_movement.sql
```

En PowerShell (Windows):
```powershell
$env:DATABASE_URL = "postgresql://user:password@host:5432/dbname"
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f .\supabase\migrations\20260112_ensure_audit_rls.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f .\supabase\migrations\20260112_register_stock_movement.sql
```

C) Usando `supabase` CLI (si prefieres migraciones gestionadas)
1. `supabase login`
2. `supabase link --project-ref <PROJECT_REF>`
3. Colocar los archivos en `supabase/migrations` y ejecutar:
```bash
supabase db push
```
Nota: revisa la documentación de tu versión del CLI; en algunos flujos `db push` aplica migraciones locales.

Ejecutar comprobaciones SQL y guardar resultados

Linux/macOS (Bash):
```bash
TS=$(date +%s)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/sql_checks.sql > supabase/migrations/sql_checks_results_${TS}.txt 2>&1
```

Windows PowerShell:
```powershell
$ts = Get-Date -Format yyyyMMddHHmmss
psql $env:DATABASE_URL -f .\supabase\migrations\sql_checks.sql | Out-File .\supabase\migrations\sql_checks_results_$ts.txt
```

Rotación de keys (recomendado)
1. En Supabase → Settings → API, regenerar `anon key` si estaba expuesta.
2. Actualizar `.env` o secret manager con la nueva `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Reiniciar la app (o redeploy) y validar que las llamadas funcionan.

Validaciones post-despliegue
- Ejecutar `sql_checks.sql` y revisar `sql_checks_results_*`.
- Probar el flujo e2e: UI → `register_reception` → revisar `receipts`, `receipt_items`, `stock_movements`, `inventory`.
- Revisar `pg_policies` y funciones existentes (`register_reception`, `register_stock_movement`).

Rollback
- Si una migración falla con cambios destructivos, restaurar desde backup antes de la migración.
- Hacer snapshot/backup antes del despliegue.

Contacto
- Puedo ayudarte a ejecutar estos pasos si me proporcionas acceso temporal o credenciales de staging, o puedo preparar un PR para revisión.
