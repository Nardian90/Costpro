# PowerShell: Ejecuta sql_checks.sql y guarda salida
if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL no está definido. Define la variable de entorno y vuelve a ejecutar."
    exit 1
}

$ts = Get-Date -Format yyyyMMddHHmmss
$out = "supabase/migrations/sql_checks_results_$ts.txt"

psql $env:DATABASE_URL -f .\supabase\migrations\sql_checks.sql | Out-File $out -Encoding utf8

if ($LASTEXITCODE -eq 0) {
    Write-Host "SQL checks ejecutados correctamente. Resultado: $out"
} else {
    Write-Error "Errores ejecutando sql_checks. Revisa: $out"
    exit $LASTEXITCODE
}
