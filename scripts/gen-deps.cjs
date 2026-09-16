// gen-deps.cjs — regenera /tmp/r2-dep/{is_admin,has_store_access}.sql limpios
const fs = require('fs');
const CAP = JSON.parse(fs.readFileSync(
  '/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE/03_prep-live-capture.json', 'utf8'));
fs.mkdirSync('/tmp/r2-dep', { recursive: true });
// has_store_access desde captura congelada
const hsa = CAP.funcs.has_store_access[0].def.replace(/\s+$/, '') + ';';
fs.writeFileSync('/tmp/r2-dep/has_store_access.sql', hsa + '\n');
console.log('has_store_access tail:', JSON.stringify(hsa.slice(-20)));
// is_admin: def embebida (capturada LIVE hoy, idéntica a congelada por drift-check previo)
const ia = [
  'CREATE OR REPLACE FUNCTION public.is_admin()',
  ' RETURNS boolean',
  ' LANGUAGE plpgsql',
  ' STABLE SECURITY DEFINER',
  " SET search_path TO 'public', 'pg_temp'",
  'AS $function$',
  'BEGIN',
  '  RETURN EXISTS (',
  '    SELECT 1',
  '    FROM public.profiles',
  '    WHERE id = auth.uid()',
  "      AND role = 'admin'",
  '  );',
  'END;',
  '$function$;',
].join('\n');
fs.writeFileSync('/tmp/r2-dep/is_admin.sql', ia + '\n');
console.log('is_admin tail:', JSON.stringify(ia.slice(-20)));
