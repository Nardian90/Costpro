#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FC-IDENTITY-PATCH — v3: GATE 1 UX integral (mandato «Ficha de Costo como módulo COSTPRO»).

Genera  public/fc/FC.html  a partir del release canónico de fichascosto
(fichascosto/release/FC.release.html, sha256 4a9ee7f3…96df, v12.10.0).

Historial:
  v1 (commit 5f5fe2f5)  R1–R11  identidad de acceso (una sola identidad COSTPRO)
  v2 (commit 1340b22)   R1–R11  ajustes del flujo de acceso (gate/wrapper/returnTo)
  v3 (este commit)      R1–R22  rediseño estructural sección Ficha + Δ + identidad
                                visual COSTPRO + modo invitado local

Garantías verificadas antes de escribir la salida:
  P1. Cada objetivo existe EXACTAMENTE una vez en el canónico (reemplazo determinista).
  P2. La región __ENGINE_START__/__ENGINE_END__ del motor queda BYTE-IGUAL (md5).
  P3. Ningún objetivo aparece en la salida con su texto antiguo.
  P4. Delta total = solo los parches listados (número y tamaño documentados).

Parches v3 (presentación/UX — cero lógica de cálculo):
  R12 resultband: elimina 4 tarjetas hero (Costo Base hist, Costo Nuevo proj,
      Variación, Unitario ajustado 17) — conserva las vars i/s/r/l (Fila 12) que
      consume la nueva sección «Resultado final»; cero display:none.
  R13 kpis grid: elimina las 8 tarjetas estadísticas (Costo Total 5, Total Gastos
      11, Utilidad 13, Precio/Tarifa 14, Impuesto 15, Precio FINAL 16, Coef GI,
      Tasa efectiva). Los valores siguen visibles en la tabla (filas normativas)
      y en la nueva línea «Resultado final». La información no se pierde: se
      elimina la pared de tarjetas redundante.
  R14 encabezados Δ / Δ % de la tabla normativa → eliminados.
  R15 varCell() → retorna '' (elimina las 2 celdas Δ/Δ% y sus data-l; función
      100% presentacional, el motor no la consume).
  R16 sección «Resultado final» compacta (línea contextual, no tarjetas) tras la
      tabla, antes de firmas: Costo total (12), Precio o Tarifa (14), Precio
      FINAL (16), Variación vs. base (usa r/l de R12).
  R17 CSS identidad COSTPRO: acento verde institucional (#15803d/#16a34a/#22c55e),
      petróleo #004d40 (teal), focus/gradientes/sombras/theme-color light+dark,
      hairline de identidad en appbar, estilos .fcres con wrap real 320–400px.
  R18 appbar: «COSTPRO · Ficha de Costo» como módulo (R2 v3).
  R19 gateEnter: rama MODO INVITADO LOCAL (flag FC_GUEST_MODE_V1 o ?guest=1):
      sin envelope, sin sb-token seeding, Auth.guestIn() local; offline-safe.
  R20 doLogout: limpia el flag de modo invitado al cerrar sesión.
  R21 Cuenta (invitado): «Crear cuenta» → «Conectar cuenta COSTPRO».
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
           '<small><b>COSTPRO</b> · Ficha de Costo · Res. 148/2023 MFP · Anexo I</small>')

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
    # Adopción de identidad COSTPRO + MODO INVITADO LOCAL (R19).
    # · Autenticado: envelope FC_CLOUD_SESSION_V1 o derivación del sb-token
    #   same-origin → sesión UI local; permisos reales siguen en RLS.
    # · Invitado (flag FC_GUEST_MODE_V1 o ?guest=1): MODO LOCAL SIN CUENTA.
    #   No se siembra credencial alguna (0 Supabase), Auth.guestIn() crea la
    #   sesión local de FC; los datos viven en este navegador. Offline-safe
    #   (0 fetches). El invitado NUNCA obtiene acceso cloud: sin token no hay
    #   autorización; RLS sigue protegiendo cost_sheets en el servidor.
    'async function gateEnter(){'
    'var _cpGuest=!1;'
    'try{_cpGuest="1"===localStorage.getItem("FC_GUEST_MODE_V1")}catch(_e){}'
    'try{if(/[?&]guest=1/.test(String(window.location.search))){'
    'try{localStorage.setItem("FC_GUEST_MODE_V1","1")}catch(_e){}_cpGuest=!0}}catch(_e){}'
    'if(!Auth.current()){'
    'if(_cpGuest){try{Auth.guestIn()}catch(_e){}}'
    'else{'
    'var _cpEnv=null;'
    'try{_cpEnv=JSON.parse(localStorage.getItem("FC_CLOUD_SESSION_V1")||"null")}catch(_e){}'
    'try{'
    'if(!(_cpEnv&&1===_cpEnv.v&&_cpEnv.access_token&&_cpEnv.user&&_cpEnv.user.id)){'
    'var _cpSb=JSON.parse(localStorage.getItem("sb-' + SB_REF + '-auth-token")||"null"),'
    '_cpS=_cpSb&&(_cpSb.currentSession||_cpSb);'
    'if(_cpS&&_cpS.access_token&&_cpS.refresh_token&&_cpS.user&&_cpS.user.id){'
    '_cpEnv={v:1,access_token:_cpS.access_token,refresh_token:_cpS.refresh_token,'
    'expires_at:_cpS.expires_at?1e3*_cpS.expires_at:Date.now()+36e5,'
    'user:{id:_cpS.user.id,email:_cpS.user.email||""},obtainedAt:new Date().toISOString()};'
    'try{localStorage.setItem("FC_CLOUD_SESSION_V1",JSON.stringify(_cpEnv))}catch(_e){}}}'
    '}catch(_e){}'
    'if(_cpEnv&&_cpEnv.access_token&&_cpEnv.user&&_cpEnv.user.id){'
    'try{sessionStorage.setItem("FC_SESSION_V1",JSON.stringify({'
    'user:_cpEnv.user.email||_cpEnv.user.id,role:"usuario",at:new Date().toISOString(),cloud:!0}))}catch(_e){}}}'
    '}'
    'if(!Auth.current())return applySessionUI(),void ' + REDIRECT_LOGIN + ';'
    'applySessionUI(),await licEnterApp(null)}'
)
T['R6'] = ('async function gateEnter(){if(!Auth.current())return applySessionUI(),void showAuth();'
           'applySessionUI(),await licEnterApp(null)}', GATE_ENTER_NEW)

T['R7'] = ('function doLogout(){Auth.logout(),FcCloud.signOut(),App.comState=null,showAuth(null,"in")}',
           'function doLogout(){try{Auth.logout()}catch(_e){}try{FcCloud.signOut()}catch(_e){}'
           'App.comState=null;try{localStorage.removeItem("FC_GUEST_MODE_V1")}catch(_e){}'
           'try{window.location.replace("/?fcLogout=1")}catch(_e){}}')

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

# ---- v3: rediseño estructural de la sección Ficha (R12–R16) ----

# R12: resultband completo (4 tarjetas + flecha) → fuera. Se conservan las vars
# i/s/r/l (valores Fila 12 base/nuevo/variación/pct) que usa R16. El chip `c`
# (píldora) muere con el bloque: ninguna referencia posterior a nivel de función.
T['R12'] = (
    'var i=a.base.values[12],s=a.nuevo.values[12],r=null!==i&&null!==s?s-i:null,'
    'l=null!==r&&null!==i&&0!==i?r/Math.abs(i):null,c=null===r?\'<span class="pill neu">\u2014</span>\':'
    'r>0?\'<span class="pill pos">\'+icon("trend",11)+"+"+fmtMoney(r,dec()).replace("$ ","").replace("-","")+"</span>":'
    'r<0?\'<span class="pill neg">\'+fmtMoney(r,dec()).replace("$ ","")+"</span>":'
    '\'<span class="pill neu">sin cambio</span>\';'
    'n+=\'<div class="resultband">\',n+=\'<div class="kpi kpi-base"><small>Costo Base \u00b7 hist\u00f3rico</small><b>\'+fmtMoney(i,dec())+'
    '\'</b><span class="d muted">Fila 12 \u00b7 datos registrados</span></div>\','
    'n+=\'<div class="rb-arrow">\'+icon("arrowR",20)+"</div>",'
    'n+=\'<div class="kpi kpi-nuevo hl"><small>Costo Nuevo \u00b7 proyectado</small><b>\'+fmtMoney(s,dec())+'
    '\'</b><span class="d muted">Recalculado por el motor</span></div>\','
    'n+=\'<div class="kpi kpi-var"><small>Variaci\u00f3n</small><b>\'+(null===r?"\u2014":(r>0?"+":"")+fmtMoney(r,dec()))+"</b>"+c+'
    '(null!==l?\'<span class="d muted">\'+fmtPctFromRatio(l)+" vs. base</span>":"")+"</div>",'
    'n+=\'<div class="kpi kpi-precio"><small>Unitario ajustado (17)</small><b>\'+fmtMoney(a.nuevo.values[17],dec())+'
    '\'</b><span class="d muted">Base: \'+fmtMoney(a.base.values[17],dec())+"</span></div>",n+="</div>";var d=isFinite',
    # nuevo: solo las vars (sin tarjetas, sin chip muerto)
    'var i=a.base.values[12],s=a.nuevo.values[12],r=null!==i&&null!==s?s-i:null,'
    'l=null!==r&&null!==i&&0!==i?r/Math.abs(i):null;var d=isFinite',
)

# R13: kpis grid completo (8 tarjetas) → fuera.
_K13 = (
    'n+=\'<div class="kpis">\',n+=\'<div class="kpi"><small>Costo Total (5)</small><b>\'+fmtMoney(a.nuevo.values[5],dec())+'
    '\'</b><span class="d muted">Base: \'+fmtMoney(a.base.values[5],dec())+"</span></div>",'
    'n+=\'<div class="kpi"><small>Total Gastos (11)</small><b>\'+fmtMoney(a.nuevo.values[11],dec())+'
    '\'</b><span class="d muted">Base: \'+fmtMoney(a.base.values[11],dec())+"</span></div>",'
    'n+=\'<div class="kpi"><small>Utilidad (13)</small><b>\'+fmtMoney(a.nuevo.values[13],dec())+'
    '\'</b><span class="d muted">Base: \'+fmtMoney(a.base.values[13],dec())+"</span></div>",'
    'n+=\'<div class="kpi"><small>Precio o Tarifa (14)</small><b>\'+fmtMoney(a.nuevo.values[14],dec())+'
    '\'</b><span class="d muted">Base: \'+fmtMoney(a.base.values[14],dec())+"</span></div>",'
    'n+=\'<div class="kpi"><small>Impuesto s/venta (15)</small><b>\'+fmtMoney(a.nuevo.values[15],dec())+'
    '\'</b><span class="d muted">\'+(!1===e.meta.isvActivo?"Desactivado \u00b7 Fila 16 = Fila 14":"Tasa "+fmtNum(+e.meta.tasaVenta||0)+" % \u00b7 Base: "+fmtMoney(a.base.values[15],dec()))+"</span></div>",'
    'n+=\'<div class="kpi"><small>Precio o Tarifa FINAL (16)</small><b>\'+fmtMoney(a.nuevo.values[16],dec())+'
    '\'</b><span class="d muted">Base: \'+fmtMoney(a.base.values[16],dec())+"</span></div>",'
    'n+=\'<div class="kpi"><small>Coef. gastos indirectos</small><b>\'+fmtMoney(t.coef.usado,dec())+'
    '\'</b><span class="d muted">l\u00edmite \'+fmtMoney(t.coef.limite,dec())+"</span></div>",'
    'n+=\'<div class="kpi"><small>Tasa efectiva de utilidad</small><b>\'+fmtPctFromRatio(t.util.tasa)+'
    '\'</b><span class="d muted">\'+escapeHtml(t.util.formula)+"</span></div>",n+="</div>",'
)
T['R13'] = (_K13, '')

# R14: encabezados Δ / Δ % de la tabla normativa
T['R14'] = ('<th class="num">\u0394</th><th class="num">\u0394 %</th>', '')

# R15: varCell → presentación eliminada (celdas, data-l y formato Δ); el motor
# no depende de ella (cálculo vive en computeFicha; píldoras/trace usan sus
# propias cuentas inline).
T['R15'] = (
    'function varCell(e,a){var t=e.base.values[a],o=e.nuevo.values[a];'
    'if(null===t||null===o)return\'<td class="num" data-l="\u0394">\u2014</td><td class="num" data-l="\u0394 %">\u2014</td>\';'
    'var n=o-t,i=0!==t?n/Math.abs(t):null,s=n>0?"varpos":n<0?"varneg":"";'
    'return\'<td class="num \'+s+\'" data-l="\u0394">\'+fmtMoney(n,dec())+'
    '\'</td><td class="num \'+s+\'" data-l="\u0394 %">\'+(null===i?"\u2014":fmtPctFromRatio(i))+"</td>"}',
    'function varCell(e,a){return""}',
)

# R16: sección «Resultado final» compacta (no tarjetas) — tras la tabla, antes
# de firmas. Usa r/l (variación Fila 12) y valores del motor; unitario (17)
# vive en la banda de producción (su lugar contextual).
_F16 = (
    "n+='<div class=\"fcres-wrap\"><div class=\"fcres-head\">'+icon(\"trend\",13)+\"Resultado final</div>\","
    "n+='<div class=\"fcres\" role=\"status\" aria-label=\"Resultado final de la ficha\">',"
    "n+='<span class=\"fcres-item\"><small>Costo total (12)</small><b>'+fmtMoney(a.nuevo.values[12],dec())+'</b><span class=\"sub\">Base: '+fmtMoney(a.base.values[12],dec())+\"</span></span>\","
    "n+='<span class=\"fcres-item\"><small>Precio o Tarifa (14)</small><b>'+fmtMoney(a.nuevo.values[14],dec())+'</b><span class=\"sub\">Base: '+fmtMoney(a.base.values[14],dec())+\"</span></span>\","
    "n+='<span class=\"fcres-item\"><small>Precio FINAL (16)</small><b>'+fmtMoney(a.nuevo.values[16],dec())+'</b><span class=\"sub\">'+(!1===e.meta.isvActivo?\"sin impuesto\":\"con impuesto \"+fmtNum(+e.meta.tasaVenta||0)+\" %\")+\"</span></span>\","
    "n+='<span class=\"fcres-item\"><small>Variaci\u00f3n vs. base</small><b class=\"'+(null===r?\"\":r>0?\"varpos\":r<0?\"varneg\":\"\")+'\">'+(null===r?\"\u2014\":(r>0?\"+\":\"\")+fmtMoney(r,dec()))+'</b><span class=\"sub\">'+(null!==l?fmtPctFromRatio(l)+\" \u00b7 sobre Fila 12\":\"\u2014\")+\"</span></span>\","
    "n+=\"</div></div>\","
)
T['R16'] = ('n+=\'<div class="sig"><div class="box">Elaborado por: <b>\'', _F16 + 'n+=\'<div class="sig"><div class="box">Elaborado por: <b>\'')

# ---- v3: identidad visual COSTPRO (R17) — light + dark ----
T['R17a'] = ('--accent:#0d5bb8;--accent-dark:#0a4894;--accent-soft:#e7f0fb;--accent-line:#c3d9f0',
             '--accent:#15803d;--accent-dark:#0f6130;--accent-soft:#e8f6ee;--accent-line:#bfe3cd')
T['R17b'] = ('--focus:#1d6fd2', '--focus:#15803d')
T['R17c'] = ('--brand-grad:linear-gradient(135deg,#0d5bb8,#093f66)',
             '--brand-grad:linear-gradient(135deg,#16a34a,#0b4f26)')
T['R17d'] = ('0 2px 6px rgba(13,91,184,.35)', '0 2px 6px rgba(21,128,61,.35)')
T['R17e'] = ('--teal:#0e6e6b', '--teal:#004d40')
T['R17f'] = ('box-shadow:0 1px 3px rgba(13,91,184,.3)', 'box-shadow:0 1px 3px rgba(21,128,61,.3)')
T['R17g'] = ('box-shadow:0 3px 14px rgba(13,91,184,.1)', 'box-shadow:0 3px 14px rgba(21,128,61,.1)')
T['R17h'] = ('.ctxhint .xbtn:hover{background:rgba(13,91,184,.12)',
             '.ctxhint .xbtn:hover{background:rgba(21,128,61,.12)')
T['R17i'] = ('.cu-promo .xbtn:hover{background:rgba(13,91,184,.12)',
             '.cu-promo .xbtn:hover{background:rgba(21,128,61,.12)')
T['R17j'] = ('.gate-mark{width:52px;height:52px;border-radius:13px;background:linear-gradient(135deg,#0d5bb8,#093f66)',
             '.gate-mark{width:52px;height:52px;border-radius:13px;background:linear-gradient(135deg,#16a34a,#0b4f26)')
T['R17k'] = ('align-items:center;background:linear-gradient(135deg,#0d5bb8,#093f66);color:#fff;padding:10px 12px',
             'align-items:center;background:linear-gradient(135deg,#16a34a,#0b4f26);color:#fff;padding:10px 12px')
T['R17l'] = ('content="#0d5bb8"', 'content="#15803d"')
T['R17m'] = ('--accent:#5aa2e8;--accent-dark:#7db8f0;--accent-soft:#152a41;--accent-line:#2c4a68',
             '--accent:#5ecf8f;--accent-dark:#7ad8a4;--accent-soft:#12281b;--accent-line:#2a5c3e')
T['R17n'] = ('--focus:#6cb0f5', '--focus:#5ecf8f')
T['R17o'] = ('--brand-grad:linear-gradient(135deg,#2c6cb4,#173a5e)',
             '--brand-grad:linear-gradient(135deg,#1d7a43,#123f24)')

# R17p: capa CSS «Resultado final» + identidad appbar + wrap móvil real
_CSS_P17 = (
    '.varneg{color:var(--err)}'
    '/* ==== COSTPRO \u00b7 Ficha de Costo \u2014 m\u00f3dulo especializado (GATE 1 UX) ==== */'
    '.appbar::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;'
    'background:linear-gradient(90deg,#15803d,#22c55e 45%,#004d40)}'
    '.brand .bt small b{color:var(--accent);font-weight:800;letter-spacing:.4px}'
    '.fcres-wrap{margin:16px 0 2px;border-top:1px solid var(--line-strong);padding-top:10px;break-inside:avoid}'
    '.fcres-head{font-size:10.5px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;'
    'color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px}'
    '.fcres{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 18px}'
    '.fcres-item{display:flex;flex-direction:column;gap:2px;min-width:0;'
    'border-left:2px solid var(--accent-line);padding-left:10px}'
    '.fcres-item small{font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--faint)}'
    '.fcres-item b{font-size:17px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.15}'
    '.fcres-item .sub{font-size:11px;color:var(--muted)}'
    '@media (max-width:520px){.fcres{grid-template-columns:1fr 1fr;gap:8px 10px}.fcres-item b{font-size:15px}}'
    '@media (max-width:355px){.fcres{grid-template-columns:1fr}}'
    '@media print{.fcres-wrap{border-top-color:#999}.fcres-item b{color:#000}'
    '.fcres-item small{color:#444}.fcres-item .sub{color:#555}}'
)
T['R17p'] = ('.varneg{color:var(--err)}', _CSS_P17)

# R18: Cuenta (invitado) — «Crear cuenta» → «Conectar cuenta COSTPRO» (PART 11)
T['R18'] = ('data-btn="guestCreate">\'+icon("user",15)+"Crear cuenta</button>',
            'data-btn="guestCreate">\'+icon("user",15)+"Conectar cuenta COSTPRO</button>')

# ------------------------------------------------------------------ main ----
# Parches de INSERCIÓN: el new contiene al old (se antepone contenido); para
# ellos P3 verifica que el ancla no quede duplicada, no que desaparezca.
INSERTIONS = {'R16', 'R17p'}
# Parches MULTI (mismo cambio semántico en 2 superficies): count esperado exacto.
MULTI = {'R18': 2}

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
        expect = MULTI.get(rid, 1)
        assert n == expect, f'{rid}: target count={n} (esperado {expect}) — ABORT, sin escritura'
        if rid not in INSERTIONS:
            assert old not in new, f'{rid}: new contains old'
        out = out.replace(old, new) if rid in MULTI else out.replace(old, new, 1)
        deltas.append({'patch': rid, 'removed': len(old) * n, 'added': len(new) * n})

    # P2: motor byte-igual
    eng_canon = md5(engine_slice(src).encode('utf-8'))
    eng_out = md5(engine_slice(out).encode('utf-8'))
    assert eng_canon == eng_out, 'ENGINE REGION CHANGED — ABORT'

    # P3: nada del texto antiguo sobrevive (los INSERTIONS: ancla sin duplicar)
    for rid, (old, _n) in T.items():
        if rid in INSERTIONS:
            assert out.count(old) == 1, f'{rid}: insertion duplicated'
        else:
            assert old not in out, f'{rid}: old text still present'

    # P5 (v3): confirmaciones explícitas del mandato — las TARJETAS de la
    # sección Ficha quedan fuera; la mini-fila compacta de la BIBLIOTECA
    # (fvals, Centro de Fichas) es otra superficie y se conserva.
    for gone in ['class="kpi kpi-base"', 'class="kpi kpi-nuevo hl"', 'class="kpi kpi-var"',
                 'class="kpi kpi-precio"', '<div class="kpis">', 'class="kpi"><small>Costo Total',
                 'class="kpi"><small>Total Gastos', 'class="kpi"><small>Precio o Tarifa',
                 '<th class="num">\u0394', 'data-l="\u0394"', 'class="resultband"', 'class="rb-arrow"']:
        assert gone not in out, f'P5: residuo de tarjeta/Δ presente: {gone!r}'
    assert 'fcres-wrap' in out and 'Resultado final' in out, 'P5: fcres ausente'
    assert out.count('fcres-item') >= 8, 'P5: fcres items incompletos'

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
