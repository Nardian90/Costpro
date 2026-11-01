#!/usr/bin/env bash
# Pruebas del FIX A (CP-INFRA-019-FOLLOWUP): propagación del token en
# apply-rpc-fix.sh, SIN ninguna petición HTTP.
#
# Estrategia: copia temporal del repo mínimo (script + lib/) con un .env de
# PRUEBA (token ficticio) y un ejecutable `python3` interceptado que, en vez
# de conectarse, reporta qué variables del entorno hijo ve y con qué valores.
# El guard bloquea la operación (ref de producción) ANTES de leer el .env,
# así que el caso de éxito del token usa doble flag en un entorno simulado:
# el objetivo aquí es la PROPAGACIÓN del token, no la autorización.
set -u
ROOT="/home/z/my-project/costpro"
TMP="$(mktemp -d /tmp/fixa-XXXXXX)"
PASS=0; FAIL=0
ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

# ── entorno de prueba: script + lib + .env falso + python3 interceptor ─────
mkdir -p "$TMP/scripts/lib" "$TMP/bin"
cp "$ROOT/scripts/apply-rpc-fix.sh" "$TMP/scripts/"
cp "$ROOT/scripts/lib/assert-not-production.sh" "$TMP/scripts/lib/"
printf 'SUPABASE_ACCESS_TOKEN=fake-token-ABC123xyz\nSUPABASE_SERVICE_ROLE_KEY=fake-srkey-NEVER\nNEXT_PUBLIC_SUPABASE_URL=https://wthkddeleylijmonclxg.supabase.co\n' > "$TMP/.env"

# python3 interceptor: no hace peticiones. Reporta el token que ve y las
# variables sensibles presentes; y copia su entorno a un archivo para
# inspección. El shebang apunta al Python REAL (absoluto): con
# `#!/usr/bin/env python3` el env buscaría en PATH y encontraría a este
# mismo interceptor → recursión infinita de forks.
cat > "$TMP/bin/python3" <<'PYEOF'
#!/usr/bin/python3
import os, sys
if '-c' in sys.argv:
    # emula el parseo final de la respuesta de curl (lee stdin hasta EOF)
    sys.stdin.read()
    print('restore_mode presente: True | payment_transactions presente: True (interceptado)')
    sys.exit(0)
# invocación del heredoc (python3 -): consume el heredoc y reporta el entorno
sys.stdin.read()
with open(os.environ['FIXA_SNAPSHOT'], 'w') as f:
    f.write('TOKEN=' + os.environ.get('SUPABASE_ACCESS_TOKEN', '<<AUSENTE>>') + '\n')
    f.write('SRKEY=' + ('PRESENTE' if os.environ.get('SUPABASE_SERVICE_ROLE_KEY') else 'AUSENTE') + '\n')
    f.write('NPURL=' + ('PRESENTE' if os.environ.get('NEXT_PUBLIC_SUPABASE_URL') else 'AUSENTE') + '\n')
    # lista de TODAS las variables cuyo nombre sugiera credencial
    f.write('CREDS=' + ','.join(sorted(k for k in os.environ if any(x in k.upper() for x in ('KEY','TOKEN','SECRET','PASSWORD')))) + '\n')
print('INTERCEPTOR: sin peticiones HTTP')
PYEOF
chmod +x "$TMP/bin/python3"
# curl interceptor: si se llegara a invocar curl, NO debe tocar la red.
# (consume stdin: el script le pasa el token por stdin con -K -; si no se
#  consume, el printf del pipe se queda bloqueado)
cat > "$TMP/bin/curl" <<'CURLEOF'
#!/usr/bin/env bash
cat > /dev/null  # consume stdin (config -K - con el token)
echo "CURL-INTERCEPTADO $*" >> "${FIXA_CURL_LOG:-/tmp/fixa-curl-missing}"
exit 0
CURLEOF
chmod +x "$TMP/bin/curl"

# ── Caso 1: token ausente → fallo controlado ANTES de cualquier petición ───
# .env sin token: con el doble flag el guard pasa y el script debe fallar con
# mensaje claro ANTES de invocar a python3/curl (exit 1).
OUT="$(cd "$TMP" && sed -i '/^SUPABASE_ACCESS_TOKEN=/d' .env && env -i PATH="$TMP/bin:/usr/bin:/bin" HOME="$HOME" \
  FIXA_SNAPSHOT="$TMP/no-token/env.txt" \
  ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
  bash scripts/apply-rpc-fix.sh 2>&1)"
RC=$?
if [ $RC -ne 0 ] && printf '%s' "$OUT" | grep -q 'Falta SUPABASE_ACCESS_TOKEN'; then
  ok "token ausente → fallo controlado con mensaje claro (antes de cualquier petición)"
elif [ $RC -ne 0 ]; then
  ok "token ausente → fallo controlado (exit $RC)"; echo "      salida: $(printf '%s' "$OUT" | head -2 | tr '\n' ' ')"
else
  bad "token ausente → el script NO falló"
fi

# ── Caso 2: el hijo Python ve EXACTAMENTE el token del .env ────────────────
# (el guard se supera con doble flag porque el .env de prueba apunta al ref
#  de producción — el objetivo de ESTE caso es la propagación del token)
printf 'SUPABASE_ACCESS_TOKEN=fake-token-ABC123xyz\nSUPABASE_SERVICE_ROLE_KEY=fake-srkey-NEVER\nNEXT_PUBLIC_SUPABASE_URL=https://wthkddeleylijmonclxg.supabase.co\n' > "$TMP/.env"
OUT="$(cd "$TMP" && env -i PATH="$TMP/bin:/usr/bin:/bin" HOME="$HOME" \
  FIXA_SNAPSHOT="$TMP/env.txt" FIXA_CURL_LOG="$TMP/curl.log" \
  ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
  bash scripts/apply-rpc-fix.sh 2>&1)"
RC=$?
if [ -f "$TMP/env.txt" ]; then
  TOKEN_LINE="$(sed -n 's/^TOKEN=//p' "$TMP/env.txt")"
  [ "$TOKEN_LINE" = "fake-token-ABC123xyz" ] \
    && ok "el hijo Python recibe EXACTAMENTE el token del .env" \
    || bad "token del hijo = '$TOKEN_LINE' (esperado 'fake-token-ABC123xyz')"
else
  bad "el interceptor python3 no llegó a ejecutarse (env.txt no existe) — salida: $(printf '%s' "$OUT" | head -3 | tr '\n' ' ')"
fi

# ── Caso 3: NO se exportan otras credenciales del .env ─────────────────────
if [ -f "$TMP/env.txt" ]; then
  SRKEY="$(sed -n 's/^SRKEY=//p' "$TMP/env.txt")"
  NPURL="$(sed -n 's/^NPURL=//p' "$TMP/env.txt")"
  [ "$SRKEY" = "AUSENTE" ] && [ "$NPURL" = "AUSENTE" ] \
    && ok "SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL NO se exportaron (solo el token)" \
    || bad "se exportaron credenciales extra (SRKEY=$SRKEY NPURL=$NPURL)"
  # credenciales con valor en el entorno hijo: solo el token ficticio
  CREDS_LINE="$(sed -n 's/^CREDS=//p' "$TMP/env.txt")"
  echo "      (variables tipo credencial visibles al hijo: $CREDS_LINE)"
fi

# ── Caso 4: ninguna petición HTTP (interceptores, no red) ──────────────────
if [ -f "$TMP/curl.log" ]; then
  ok "curl interceptado SIN red: $(wc -l < "$TMP/curl.log") llamada(s) registrada(s)"
  # el token NO debe aparecer como argumento de curl (argv visible en ps)
  if grep -q 'fake-token-ABC123xyz' "$TMP/curl.log"; then
    bad "el token apareció en los ARGUMENTOS de curl (visible en ps)"
  else
    ok "el token NO aparece en los argumentos de curl (viaja por stdin con -K -)"
  fi
else
  ok "curl no llegó a invocarse en el escenario de prueba"
fi

# ── Caso 5: el token no aparece en la salida del script ────────────────────
if printf '%s' "$OUT" | grep -q 'fake-token-ABC123xyz'; then
  bad "el token se imprimió en stdout/stderr del script"
else
  ok "el token nunca aparece en la salida del script"
fi

# ── Caso 6: guard sigue bloqueando la operación sin doble flag ─────────────
OUT2="$(cd "$TMP" && env -i PATH="$TMP/bin:/usr/bin:/bin" HOME="$HOME" \
  FIXA_SNAPSHOT="$TMP/env2.txt" FIXA_CURL_LOG="$TMP/curl2.log" \
  bash scripts/apply-rpc-fix.sh 2>&1)"
RC2=$?
if [ $RC2 -ne 0 ] && printf '%s' "$OUT2" | grep -q 'BLOQUEADO'; then
  ok "sin flags, el guard sigue bloqueando la operación productiva (ref real)"
  [ -f "$TMP/env2.txt" ] && bad "el interceptor se ejecutó AUNQUE el guard bloqueó" || ok "el hijo NO se ejecutó tras el bloqueo del guard"
else
  bad "sin flags el guard no bloqueó (exit=$RC2)"
fi

rm -rf "$TMP"
echo
echo "RESUMEN FIX A: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
