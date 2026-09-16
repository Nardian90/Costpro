#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FC-IDENTITY-PATCH — FC ACCESS FLOW FIX (GATE 1, cambio quirúrgico documentado).

Genera  public/fc/FC.html  a partir del release canónico de fichascosto
(fichascosto/release/FC.release.html, sha256 4a9ee7f3…96df, v12.10.0).

Objetivo (mandato): FC deja de ser un segundo producto (landing + login propios)
y pasa a ser una superficie de COSTPRO con UNA SOLA IDENTIDAD, preservando
intacto el motor normativo, las fórmulas, la persistencia local y el offline.

Garantías que este script verifica antes de escribir la salida:
  P1. Cada objetivo existe EXACTAMENTE una vez en el canónico (reemplazo determinista).
  P2. La región __ENGINE_START__/__ENGINE_END__ del motor queda BYTE-IGUAL (md5).
  P3. Ningún objetivo aparece en la salida con su texto antiguo.
  P4. Delta total = solo los parches listados (numero y tamaño documentados).

Parches (identidad/UX de acceso únicamente — cero lógica de cálculo):
  R1  <title> FC → COSTPRO
  R2  appbar <small> añade COSTPRO
  R3  Landing.shouldShow → false (landing marketing NUNCA se muestra)
  R4  Landing.open → volver a COSTPRO (el botón «Presentación» pasa a «Volver a COSTPRO»)
  R5  Landing.close → no-op (inerte)
  R6  gateEnter → adopta identidad COSTPRO (envelope o sb-token same-origin);
      sin identidad → redirect a login COSTPRO con returnTo=/fc/
  R7  doLogout → cierra contexto FC y vuelve a COSTPRO (sin showAuth)
  R8  showAuth → REDIRECT a login COSTPRO (login propio de FC = INEXISTENTE;
      cubre guestTransition, guestCreate, openCuenta y cualquier path futuro)
  R9  botón verLanding «Presentación» → «Volver a COSTPRO»
  R10 FcCloud.signInFromAuthScreen (form cloud en auth screen) → redirect login COSTPRO
  R11 FcCloud.signInFromCuenta (form cloud en Mi cuenta) → redirect login COSTPRO
"""
import hashlib
import json
import sys

CANON = '/home/z/my-project/fichascosto/release/FC.release.html'
OUT = '/home/z/my-project/Costpro/public/fc/FC.html'

SB_REF = 'wthkddeleylijmonclxg'  # proyecto Supabase compartido (idéntico al wrapper)

REDIRECT_LOGIN = 'window.location.replace("/?login=1&returnTo=%2Ffc%2F")'

# ---------------------------------------------------------------- targets ----
T = {}
T['R1'] = ('<title>FC · Ficha de Costos y Gastos — Res. 148/2023 MFP</title>',
           '<title>COSTPRO · Ficha de Costos y Gastos — Res. 148/2023 MFP</title>')

T['R2'] = ('<small>Resolución 148/2023 · MFP · Anexo I</small>',
           '<small>COSTPRO · Resolución 148/2023 · MFP · Anexo I</small>')

T['R3'] = ('shouldShow:function(){try{return"1"!==localStorage.getItem(LANDING_KEY)}catch(e){return!1}}',
           'shouldShow:function(){return!1}')

T['R4'] = ('open:function(e){var a=this.el("landing");a&&(this.fromApp=!e,this.fromApp&&'
           '(this.lastFocus=document.activeElement),this.render(),a.hidden=!1,'
           'document.body.classList.add("landing-open"),a.scrollTop=0)}',
           'open:function(){window.location.href="/"}')

T['R5'] = ('close:function(){var e=this.el("landing");if(e&&!e.hidden){if(e.hidden=!0,'
           'document.body.classList.remove("landing-open"),this.fromApp&&this.lastFocus&&'
           'this.lastFocus.focus)try{this.lastFocus.focus()}catch(e){}this.fromApp=!1,'
           'this.lastFocus=null}}',
           'close:function(){}')

GATE_ENTER_NEW = (
    # Adopción de identidad COSTPRO (misma lógica que el wrapper /fc/, mismo origen):
    # 1) envelope FC_CLOUD_SESSION_V1 válido; 2) si no, derivarlo del token estándar
    # de supabase-js de COSTPRO (sb-<ref>-auth-token, same-origin). Solo crea sesión
    # de UI local; NUNCA otorga permisos: todo acceso remoto sigue pasando por el
    # access token + RLS (created_by = auth.uid()). 0 fetches: offline-safe.
    'async function gateEnter(){'
    'if(!Auth.current()){'
    'try{var _cpEnv=null;'
    'try{_cpEnv=JSON.parse(localStorage.getItem("FC_CLOUD_SESSION_V1")||"null")}catch(_e){}'
    'if(!(_cpEnv&&1===_cpEnv.v&&_cpEnv.access_token&&_cpEnv.user&&_cpEnv.user.id)){'
    'try{var _cpSb=JSON.parse(localStorage.getItem("sb-' + SB_REF + '-auth-token")||"null"),'
    '_cpS=_cpSb&&(_cpSb.currentSession||_cpSb);'
    'if(_cpS&&_cpS.access_token&&_cpS.refresh_token&&_cpS.user&&_cpS.user.id){'
    '_cpEnv={v:1,access_token:_cpS.access_token,refresh_token:_cpS.refresh_token,'
    'expires_at:_cpS.expires_at?1e3*_cpS.expires_at:Date.now()+36e5,'
    'user:{id:_cpS.user.id,email:_cpS.user.email||""},obtainedAt:new Date().toISOString()};'
    'try{localStorage.setItem("FC_CLOUD_SESSION_V1",JSON.stringify(_cpEnv))}catch(_e){}}}catch(_e){}}'
    'if(_cpEnv&&_cpEnv.access_token&&_cpEnv.user&&_cpEnv.user.id){'
    'try{sessionStorage.setItem("FC_SESSION_V1",JSON.stringify({'
    'user:_cpEnv.user.email||_cpEnv.user.id,role:"usuario",at:new Date().toISOString(),cloud:!0}))}catch(_e){}}'
    '}catch(_e){}}'
    'if(!Auth.current())return applySessionUI(),void ' + REDIRECT_LOGIN + ';'
    'applySessionUI(),await licEnterApp(null)}'
)
T['R6'] = ('async function gateEnter(){if(!Auth.current())return applySessionUI(),void showAuth();'
           'applySessionUI(),await licEnterApp(null)}', GATE_ENTER_NEW)

T['R7'] = ('function doLogout(){Auth.logout(),FcCloud.signOut(),App.comState=null,showAuth(null,"in")}',
           'function doLogout(){try{Auth.logout()}catch(_e){}try{FcCloud.signOut()}catch(_e){}'
           'App.comState=null;try{window.location.replace("/?fcLogout=1")}catch(_e){}}')

T['R8'] = ('function showAuth(e,a){document.getElementById("authScreen").hidden=!1,'
           'document.body.classList.remove("gateadmin"),document.body.classList.add("gated"),'
           'auSetMode(a||_auMode);var t=document.getElementById("auErr");t.hidden=!e,'
           'e&&(t.textContent=e);var o=document.getElementById("auPass");o&&(o.value=""),'
           'setTimeout(function(){try{(e?document.getElementById("auUser"):'
           'document.getElementById("auUser").value?document.getElementById("auPass"):'
           'document.getElementById("auUser")).focus()}catch(e){}},40)}',
           'function showAuth(e,a){' + REDIRECT_LOGIN + '}')

T['R9'] = ('data-btn="verLanding" title="Volver a la presentación de COSTPRO" '
           'aria-label="Volver a la presentación de COSTPRO">\'+icon("home",15)+\'Presentación</button>',
           'data-btn="verLanding" title="Volver a COSTPRO" aria-label="Volver a COSTPRO">'
           '\'+icon("home",15)+\'Volver a COSTPRO</button>')

T['R10'] = ('signInFromAuthScreen:function(){var e=M("auCloudEmail","auCloudPass","auCloudMsg");'
            'if(e){var a=document.getElementById("auCloudGo");a&&(a.disabled=!0),'
            'h(e.email,e.pass).then(function(t){a&&(a.disabled=!1),t.ok?(e.pw.value="",'
            'toast("Cuenta COSTPRO conectada. Tu plan se muestra en Mi cuenta.","ok")):'
            'e.msg&&(e.msg.textContent=t.error,e.msg.hidden=!1)})}}',
            'signInFromAuthScreen:function(){' + REDIRECT_LOGIN + '}')

T['R11'] = ('signInFromCuenta:function(){var e=M("cuCloudEmail","cuCloudPass","cuCloudMsg");'
            'e&&h(e.email,e.pass).then(function(a){a.ok?(e.pw.value="",'
            'toast("Cuenta COSTPRO conectada.","ok")):'
            'e.msg&&(e.msg.textContent=a.error,e.msg.hidden=!1)})}',
            'signInFromCuenta:function(){' + REDIRECT_LOGIN + '}')

# ------------------------------------------------------------------ main ----
def md5(b): return hashlib.md5(b).hexdigest()
def sha256(b): return hashlib.sha256(b).hexdigest()

def engine_slice(s: str):
    a = s.find('__ENGINE_START__')
    b = s.find('__ENGINE_END__')
    assert a != -1 and b != -1 and b > a, 'engine guards not found'
    return s[a:b]

def main():
    src = open(CANON, encoding='utf-8').read()
    canon_sha = sha256(src.encode('utf-8'))
    expect_sha_prefix = '4a9ee7f3ed4d56b4441e5f271153ca6b17e0301c362d297f0862a223a31296df'
    assert canon_sha == expect_sha_prefix, f'canonical hash mismatch: {canon_sha}'

    out = src
    deltas = []
    for rid, (old, new) in T.items():
        n = src.count(old)
        assert n == 1, f'{rid}: target count={n} (esperado 1) — ABORT, sin escritura'
        assert old not in new
        out = out.replace(old, new, 1)
        deltas.append({'patch': rid, 'removed': len(old), 'added': len(new)})

    # P2: motor byte-igual
    eng_canon = md5(engine_slice(src).encode('utf-8'))
    eng_out = md5(engine_slice(out).encode('utf-8'))
    assert eng_canon == eng_out, 'ENGINE REGION CHANGED — ABORT'

    # P3: nada del texto antiguo sobrevive
    for rid, (old, _n) in T.items():
        assert old not in out, f'{rid}: old text still present'

    open(OUT, 'w', encoding='utf-8', newline='').write(out)

    report = {
        'canonical': {'path': CANON, 'sha256': canon_sha, 'bytes': len(src)},
        'output': {'path': OUT, 'sha256': sha256(out.encode('utf-8')), 'bytes': len(out)},
        'engine_md5_canonical': eng_canon,
        'engine_md5_output': eng_out,
        'engine_equal': eng_canon == eng_out,
        'patches': deltas,
        'patch_count': len(deltas),
        'net_delta_bytes': sum(d['added'] - d['removed'] for d in deltas),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0

if __name__ == '__main__':
    sys.exit(main())
