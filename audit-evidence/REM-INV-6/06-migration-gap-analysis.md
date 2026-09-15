# REM-INV-6 — 06 GATE O: análisis de brecha migratoria + corrección del detector

## El hallazgo REM-INV-5 ("62/134 funciones sin representación") era INFLADO

El detector de REM-INV-5 (extractor estático de `security-contract-test-static.cjs`)
tenía **3 bugs estructurales** (heredados del extractor de la época):

1. **lastIndex bug**: `re.exec(cleanText.slice(idx))` — un regex con flag `/g`
   persiste `lastIndex` entre llamadas sobre STRINGS DISTINTOS (cada slice es un
   string nuevo). Tras la primera función, la búsqueda reanuda en la posición del
   match anterior dentro del nuevo slice → **toda función definida después de la
   primera en archivos multi-función quedaba omitida** (los archivos con N funciones
   aportaban ~1-2 claves en vez de N).
2. **body offset bug**: `bodyStart = j+1+asM.index+asM[1].length` omite los 2 chars
   del keyword `AS` → el cuerpo extraído empieza 2 chars antes (tail del tag
   `$function$` → `n$`).
3. **$$ self-match**: con el offset del (2), para funciones con tag `$$` el
   `indexOf('$$', bodyStart+2)` re-encontraba el TAG DE APERTURA → cuerpo VACÍO →
   la función era invisible a la detección de escritura de Layer B.
   (154 archivos de migraciones usan `AS $$`.)

## Detector antiguo vs corregido (simulación controlada, out/old-detector-62.json)

- Extractor antiguo: 257 claves de función en migraciones; "no representadas" a
  nivel clave = 31; a nivel nombre = 26; Layer B writeFns = 86 verificadas.
- La cifra exacta "62" no fue persistida por REM-INV-5 (solo ejemplos); lo que
  importa es que el método era estructuralmente incompleto.
- Detector corregido (post-fix): 317 claves; censo 134 = **97 EXACT + 23 DRIFTED +
  14 ABSENT**; tras las migraciones canónicas: **134 EXACT (Layer C 134/134)**.
- Cada función del hallazgo antiguo quedó clasificada (03 CSV): las que sí estaban
  en migraciones = C1 (detector falló); históricas reescritas = C2; ausentes reales
  = C7/C3 (creación out-of-band genuina, confirmada además por replay EJECUTADO).

## Hallazgo estructural adicional (fuera del detector)

- El stream de migraciones **NO contiene la migración de esquema base**
  (profiles/stores/transactions/inventory/enums user_role/movement_type... creados
  out-of-band pre-disciplina) → un replay FULL-TABLE desde cero es imposible hoy
  (153/435 archivos OK; cascada documentada en out/staging-replay.json).
  REMEDIACIÓN EN ESTE GATE: replay de la SUPERFICIE DE SEGURIDAD (funciones+ACL)
  sobre fixture base (enums+tablas stub desde LIVE) — ejecución real PostgreSQL 17.6.
- 5 archivos NO-migración en supabase/migrations/ (DEMO_RESET_SCRIPT*.sql ×3,
  register_reception_rpc.sql, sql_checks.sql) se ordenan DESPUÉS de las
  migraciones timestamped (minúsculas > dígitos) y sus definiciones antiguas
  SOBREESCRIBIRÍAN el estado canónico en un replay. MOVIDOS a supabase/scripts/
  (git mv) — necesarios para la reproducibilidad del stream.

## Regla aplicada

"No crear migraciones innecesarias solo para satisfacer un detector defectuoso":
las 53 materializaciones NO se basaron en el detector estático sino en el
replay EJECUTADO (PostgreSQL 17.6 real): solo se materializa lo que el replay
real deja distinto del estado certificado (18 MISSING + 35 BODY), verificado
con md5(pg_get_functiondef).
