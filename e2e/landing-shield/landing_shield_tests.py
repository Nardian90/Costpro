#!/usr/bin/env python3
"""
BLINDAJE TOTAL DEL LANDING PAGE — Suite de pruebas obligatorias (TEST 1–8)

Ejecuta la matriz de escenarios {Theme} × {Performance} × {Enhanced} contra
http://localhost:3000/ y demuestra que el Landing Page es VISUALMENTE
IDÉNTICO en todos, mientras la app interna conserva sus modos.

Evidencia:
  - Invariantes de computed styles del landing (idénticos en todos los escenarios)
  - Estado de <html> (el landing ya no lo muta; los modos siguen aplicando)
  - Prueba de re-arme de reglas de modo al retirar #landing-root (app OK)
  - Capturas comparadas píxel a píxel (canvas oculto uniformemente: partículas random)
Salida: docs/audits/landing-shield-evidence/ (JSON + MD + PNG)
"""
import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = 'http://localhost:3000'
OUT = Path('/home/z/my-project/Costpro/docs/audits/landing-shield-evidence')
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORT = {'width': 1440, 'height': 900}

COMMON_INIT = """
localStorage.setItem('costpro-visited', 'true');          // saltar splash largo
localStorage.setItem('costpro-promo-dismissed', 'true');  // sin banner promocional
localStorage.setItem('costpro_cookie_consent', JSON.stringify({
  essential: true, analytics: false, functional: true, marketing: false,
  timestamp: new Date().toISOString(), version: '1.0'
}));
// DETERMINISMO DE CAPTURAS: congelar temporizadores (el carrusel demo del
// hero avanza con setInterval → cada corrida capturaría otro paso).
// Se aplica IGUAL en todos los escenarios → comparación justa.
window.setInterval = function () { return 0; };
"""

# Escenarios TEST 1–8 (misión §19). preset = localStorage ANTES de cargar.
SCENARIOS = [
    {'id': 'TEST1',  'name': 'Baseline (tema default + Performance default)',
     'preset': {}, 'op': 'load'},
    {'id': 'TEST2',  'name': 'Cambio de Theme a light',
     'preset': {'theme': 'light'}, 'op': 'load'},
    {'id': 'TEST3',  'name': 'Modo Performance activado',
     'preset': {'costpro-mode': 'performance', 'costpro-mode-manual-override': 'true'},
     'op': 'load', 'probe': True},
    {'id': 'TEST4',  'name': 'Modo Enhanced activado',
     'preset': {'costpro-mode': 'enhanced', 'costpro-mode-manual-override': 'true'},
     'op': 'load'},
    {'id': 'TEST5',  'name': 'Theme light + Performance + todo combinado',
     'preset': {'theme': 'light', 'costpro-mode': 'performance',
                'costpro-mode-manual-override': 'true'},
     'op': 'load'},
    {'id': 'TEST6',  'name': 'Todo desactivado (limpio)',
     'preset': {}, 'op': 'load'},
    {'id': 'TEST7',  'name': 'Recarga de página',
     'preset': {}, 'op': 'reload'},
    {'id': 'TEST8',  'name': 'Navegación /privacy y regreso (equivalente logout/login)',
     'preset': {'theme': 'light', 'costpro-mode': 'performance',
                'costpro-mode-manual-override': 'true'},
     'op': 'nav'},
]

# Invariantes del landing: deben ser IDÉNTICOS en todos los escenarios.
INVARIANTS_JS = """
() => {
  const root = document.getElementById('landing-root');
  if (!root) return { error: 'NO #landing-root' };
  const cs = el => el ? getComputedStyle(el) : null;

  const fg = root.querySelector('.text-foreground');
  const glass = Array.from(root.querySelectorAll('[class*="backdrop-blur"]'))[0];
  const animated = Array.from(root.querySelectorAll('[class*="animate-"]')).find(e => {
    const a = getComputedStyle(e).animationName;
    return a && a !== 'none';
  });
  const canvases = Array.from(root.querySelectorAll('canvas')).map(c => getComputedStyle(c).display);
  const borderTok = Array.from(root.querySelectorAll('[class*="border-border"]'))[0];
  const rootCs = cs(root);

  return {
    rootBg: rootCs ? rootCs.backgroundColor : null,
    rootColorScheme: rootCs ? rootCs.colorScheme : null,
    varForeground: rootCs ? rootCs.getPropertyValue('--foreground').trim() : null,
    varMuted: rootCs ? rootCs.getPropertyValue('--muted').trim() : null,
    varPrimary: rootCs ? rootCs.getPropertyValue('--primary').trim() : null,
    varBrand: rootCs ? rootCs.getPropertyValue('--brand').trim() : null,
    varLpBg: rootCs ? rootCs.getPropertyValue('--lp-bg').trim() : null,
    foregroundColor: fg ? cs(fg).color : null,
    borderColor: borderTok ? cs(borderTok).borderTopColor : null,
    glassBackdrop: glass ? cs(glass).backdropFilter : null,
    animatedName: animated ? cs(animated).animationName : null,
    animatedCount: animated ? 1 : 0,
    canvasDisplays: canvases.slice(0, 3),
    hasLandingTokensClass: root.classList.contains('landing-tokens'),
    stylesheetLandingRules: (() => {
      let n = 0;
      for (const sheet of document.styleSheets) {
        try { for (const r of sheet.cssRules) {
          if (r.selectorText && r.selectorText.includes('#landing-root')) n++;
        } } catch (e) {}
      }
      return n;
    })(),
  };
}
"""

HTML_STATE_JS = """
() => ({
  classes: Array.from(document.documentElement.classList).sort(),
  dataConnectivity: document.documentElement.dataset.connectivity || null,
})
"""


def settle_landing(page):
    """Espera landing montado + pre-scroll para estabilizar whileInView."""
    page.wait_for_selector('#landing-root', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=60000)
    page.wait_for_timeout(600)
    # pre-scroll escalonado hasta el fondo y vuelta al tope (dispara whileInView once)
    height = page.evaluate('document.body.scrollHeight')
    step = 900
    y = 0
    while y < height:
        y += step
        page.evaluate(f'window.scrollTo(0, {y})')
        page.wait_for_timeout(120)
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(700)


def collect(page):
    invariants = page.evaluate(INVARIANTS_JS)
    html_state = page.evaluate(HTML_STATE_JS)
    return {'invariants': invariants, 'html': html_state}


def screenshot_pair(page, scenario_id):
    # Ocultar canvas uniformemente (partículas Math.random → ruido de píxeles).
    # Se aplica IGUAL en todos los escenarios → comparación justa. El display
    # del canvas se verifica en los invariantes (debe seguir montado).
    page.add_style_tag(content='#landing-root canvas { visibility: hidden !important; }')
    page.wait_for_timeout(150)
    p1 = OUT / f'{scenario_id}_top.png'
    page.screenshot(path=str(p1), animations='disabled')
    page.evaluate('window.scrollTo(0, 2000)')
    page.wait_for_timeout(500)
    p2 = OUT / f'{scenario_id}_sec2.png'
    page.screenshot(path=str(p2), animations='disabled')
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(200)
    return [p1, p2]


def probe_mode_rules(page, results):
    """Prueba de doble vía: con landing montado las reglas de modo están
    desarmadas (probe conserva blur/animación); retirando #landing-root se
    re-ensamblan (probe pierde blur/animación) → la app conserva Performance.
    NOTA: la invalidación de :has() es asíncrona en Chromium → esperar frames
    entre pasos (3 evaluates separados + timeouts)."""
    results['probe'] = page.evaluate("""
    () => {
      const mk = (cls) => { const d = document.createElement('div'); d.className = cls; document.body.appendChild(d); return d; };
      window.__probeGlass = mk('glass-card backdrop-blur-md');
      window.__probeAnim = mk('animate-float');
      return {
        probeGlassWithLanding: getComputedStyle(window.__probeGlass).backdropFilter,
        probeAnimWithLanding: getComputedStyle(window.__probeAnim).animationName,
      };
    }
    """)
    page.evaluate("() => { const r = document.getElementById('landing-root'); if (r) r.remove(); }")
    page.wait_for_timeout(300)   # frames para que Chromium revalide :has()
    page.evaluate("() => { void document.body.offsetWidth; }")
    page.wait_for_timeout(200)
    after = page.evaluate("""
    () => ({
      probeGlassWithoutLanding: getComputedStyle(window.__probeGlass).backdropFilter,
      probeAnimWithoutLanding: getComputedStyle(window.__probeAnim).animationName,
    })
    """)
    results['probe'].update(after)
    page.evaluate("() => { window.__probeGlass && window.__probeGlass.remove(); window.__probeAnim && window.__probeAnim.remove(); }")


def img_diff(path_a, path_b):
    from PIL import Image, ImageChops
    a, b = Image.open(path_a).convert('RGB'), Image.open(path_b).convert('RGB')
    if a.size != b.size:
        return {'identical': False, 'reason': f'size {a.size} vs {b.size}', 'diffPixels': -1}
    diff = ImageChops.difference(a, b)
    gray = diff.convert('L')
    hist = gray.histogram()
    threshold = 8
    diff_pixels = sum(hist[threshold + 1:])
    total = a.size[0] * a.size[1]
    return {'identical': diff_pixels == 0, 'diffPixels': diff_pixels,
            'totalPixels': total, 'diffPct': round(100 * diff_pixels / total, 4)}


def main():
    results = {}
    shots = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for sc in SCENARIOS:
            sid = sc['id']
            print(f'▶ {sid}: {sc["name"]}')
            ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=1,
                                      locale='es-CU', reduced_motion='reduce')
            ctx.add_init_script(
                COMMON_INIT +
                ''.join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});\n"
                        for k, v in sc['preset'].items()))
            page = ctx.new_page()
            page.goto(BASE + '/', wait_until='domcontentloaded', timeout=90000)
            settle_landing(page)
            data = collect(page)

            if sc.get('probe'):
                # capturar probe ANTES de los screenshots (probe remove #landing-root)
                # → usar una página nueva para no perder el estado del escenario.
                page2 = ctx.new_page()
                page2.goto(BASE + '/', wait_until='domcontentloaded', timeout=90000)
                settle_landing(page2)
                probe_mode_rules(page2, data)
                page2.close()
                # recargar la página principal por si el probe corrió aquí
                if 'probe' not in data:
                    pass

            if sc['op'] == 'reload':
                page.reload(wait_until='domcontentloaded', timeout=90000)
                settle_landing(page)
                data = collect(page)

            if sc['op'] == 'nav':
                page.goto(BASE + '/privacy', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_timeout(400)
                data['privacyHtml'] = page.evaluate(HTML_STATE_JS)
                page.go_back(wait_until='domcontentloaded', timeout=90000)
                settle_landing(page)
                data = collect(page)

            results[sid] = data
            shots[sid] = screenshot_pair(page, sid)
            print(f'   invariants: {json.dumps(data["invariants"], ensure_ascii=False)[:180]}')
            print(f'   html: {data["html"]["classes"]}')
            ctx.close()
        browser.close()

    # ── Verificaciones ──
    base = results['TEST1']
    checks = []
    ok_all = True

    def check(name, ok, detail=''):
        global_ok = {'name': name, 'ok': bool(ok), 'detail': detail}
        checks.append(global_ok)
        return bool(ok)

    # 0) landing montado en todos
    for sid, r in results.items():
        ok_all &= check(f'{sid}: #landing-root presente',
                        'error' not in r['invariants'])

    base_inv = base['invariants']
    # 1) invariantes de landing idénticos en todos los escenarios
    for sid, r in results.items():
        if sid == 'TEST1':
            continue
        inv = r['invariants']
        for k in base_inv:
            if k in ('stylesheetLandingRules',):
                continue
            same = base_inv.get(k) == inv.get(k)
            ok_all &= check(f'{sid}: invariante {k} idéntico al baseline',
                            same,
                            f'{base_inv.get(k)!r} vs {inv.get(k)!r}')

    # 2) glass y animaciones vivas en TODOS los escenarios (incl. performance)
    for sid, r in results.items():
        inv = r['invariants']
        ok_all &= check(f'{sid}: glassmorphism (backdrop-blur) vivo',
                        inv.get('glassBackdrop') not in (None, 'none'),
                        str(inv.get('glassBackdrop')))
        ok_all &= check(f'{sid}: animaciones CSS vivas',
                        inv.get('animatedName') not in (None, 'none'),
                        str(inv.get('animatedName')))
        ok_all &= check(f'{sid}: canvas del landing NO display:none',
                        all(d != 'none' for d in inv.get('canvasDisplays', []))
                        if inv.get('canvasDisplays') else False,
                        str(inv.get('canvasDisplays')))

    # 3) tokens dark fijados aunque el tema/modo digan lo contrario
    def norm_hex(v):
        v = (v or '').strip().lower()
        if v == '#000':
            v = '#000000'
        return v

    for sid, r in results.items():
        inv = r['invariants']
        ok_all &= check(f'{sid}: fondo landing = rgb(2, 6, 23)',
                        inv.get('rootBg') == 'rgb(2, 6, 23)', str(inv.get('rootBg')))
        ok_all &= check(f'{sid}: --foreground = #e4e4e7',
                        inv.get('varForeground') == '#e4e4e7', str(inv.get('varForeground')))
        ok_all &= check(f'{sid}: --muted = #1e1e1e',
                        inv.get('varMuted') == '#1e1e1e', str(inv.get('varMuted')))
        ok_all &= check(f'{sid}: --primary = #22c55e',
                        inv.get('varPrimary') == '#22c55e', str(inv.get('varPrimary')))
        ok_all &= check(f'{sid}: --brand = #39ff14',
                        inv.get('varBrand') == '#39ff14', str(inv.get('varBrand')))
        ok_all &= check(f'{sid}: --lp-bg = #000000',
                        norm_hex(inv.get('varLpBg')) == '#000000', str(inv.get('varLpBg')))

    # 4) <html>: el landing ya NO fuerza branding; los modos sí aplican
    for sid, sc in zip([s['id'] for s in SCENARIOS], SCENARIOS):
        classes = results[sid]['html']['classes']
        ok_all &= check(f'{sid}: <html> sin mode-enhanced forzado por el landing',
                        'mode-enhanced' not in classes
                        or sc['preset'].get('costpro-mode') == 'enhanced',
                        str(classes))
        if sc['preset'].get('costpro-mode') == 'performance':
            ok_all &= check(f'{sid}: <html> conserva mode-performance (handler activo)',
                            'mode-performance' in classes, str(classes))
        if sc['preset'].get('theme') == 'light':
            ok_all &= check(f'{sid}: <html> con theme light (sin dark forzado)',
                            'light' in classes and 'dark' not in classes, str(classes))

    # 5) reglas compiladas del escudo presentes
    ok_all &= check('CSS: reglas #landing-root compiladas (shield + variante dark)',
                    base_inv.get('stylesheetLandingRules', 0) > 0,
                    str(base_inv.get('stylesheetLandingRules')))

    # 6) probe de doble vía en TEST3
    probe = results['TEST3'].get('probe')
    if probe:
        ok_all &= check('PROBE: con landing montado, .glass-card conserva backdrop-filter',
                        probe.get('probeGlassWithLanding') not in (None, 'none'),
                        str(probe.get('probeGlassWithLanding')))
        ok_all &= check('PROBE: sin landing, reglas de modo re-armadas (backdrop none)',
                        probe.get('probeGlassWithoutLanding') == 'none',
                        str(probe.get('probeGlassWithoutLanding')))
        ok_all &= check('PROBE: con landing, animate-float vivo',
                        probe.get('probeAnimWithLanding') not in (None, 'none'),
                        str(probe.get('probeAnimWithLanding')))
        ok_all &= check('PROBE: sin landing, animate-float muerto (modo performance)',
                        probe.get('probeAnimWithoutLanding') == 'none',
                        str(probe.get('probeAnimWithoutLanding')))
    else:
        ok_all &= check('PROBE: ejecutado', False, 'no probe data')

    # 7) TEST8: <html> en /privacy refleja preferencias (app interna funcionando)
    if 'privacyHtml' in results['TEST8']:
        pc = results['TEST8']['privacyHtml']['classes']
        ok_all &= check('TEST8: en /privacy <html> sigue light+performance (app OK)',
                        'light' in pc and 'mode-performance' in pc, str(pc))

    # 8) comparación de capturas vs baseline
    # Tolerancia 0.15%: residuo WAAPI de animaciones infinitas no congelables
    # (p. ej. pulsos framer con reduced-motion parcial). Se reporta el % exacto.
    for sid in shots:
        if sid == 'TEST1':
            continue
        for i, kind in enumerate(['top', 'sec2']):
            d = img_diff(shots['TEST1'][i], shots[sid][i])
            ok_all &= check(f'{sid}: screenshot {kind} idéntico al baseline (tol 0.15%)',
                            d['identical'] or d.get('diffPct', 100) <= 0.15,
                            json.dumps(d))

    # ── Persistir evidencia ──
    (OUT / 'results.json').write_text(json.dumps(
        {'scenarios': results, 'checks': checks, 'okAll': ok_all,
         'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')},
        indent=2, ensure_ascii=False))

    print('\n' + '═' * 70)
    failed = [c for c in checks if not c['ok']]
    print(f'RESULTADO: {len(checks) - len(failed)}/{len(checks)} checks OK — '
          f'{"✅ BLINDAJE VERIFICADO" if ok_all else "❌ FALLOS"}')
    for c in failed:
        print(f"  ✗ {c['name']}: {c['detail']}")
    return 0 if ok_all else 1


if __name__ == '__main__':
    sys.exit(main())
