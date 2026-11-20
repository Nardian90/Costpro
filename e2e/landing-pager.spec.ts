/**
 * e2e/landing-pager.spec.ts — ADN-LANDING-HERO-AND-PAGER-FIX-004 §8 + 006
 * ============================================================================
 * Navegador lateral de cinco puntos + ESCENARIO PERSISTENTE (ADN-006).
 *
 * Cobertura mínima exigida:
 *   1. Carga correcta del landing.
 *   2. Clic en cada uno de los 5 puntos → aterrizaje en el CAPÍTULO exacto
 *      (posición de reposo de la primera escena del capítulo, calculada por el
 *      propio ScrollTrigger: window.__cinemaSceneScrollY).
 *   3. Actualización del punto activo al hacer scroll manual (rueda real).
 *   4. Repetición en móvil (drawer) y escritorio.
 *   5. Guard anti-drift: los 5 IDs de sectionIds existen en el DOM.
 *   6. ADN-006: el escenario se mantiene fijado y las escenas se SUSTITUYEN
 *      (el stage no se desplaza durante el recorrido; un único panel activo).
 *
 * El fallo histórico del punto 2 (misión 004): sectionRefs[1] era una ref
 * nunca adjunta → el clic no hacía nada en silencio. Este spec falla si algún
 * punto deja de desplazar.
 * ============================================================================
 */
import { test, expect, type Page } from '@playwright/test';

const SECTION_IDS = ['hero', 'como-funciona', 'features', 'pricing', 'faq'] as const;
const LABELS = ['Inicio', 'Plataforma', 'Funcionalidades', 'Precios', 'Ayuda'] as const;
/** Tolerancia de aterrizaje (escenas: el snap completa al reposo exacto). */
const LANDING_TOLERANCE = 60;

async function openLanding(page: Page): Promise<void> {
  await page.goto('/');
  // Espera el splash → titular del hero (patrón de landing-page.spec.ts)
  await expect(page.getByRole('heading', { name: /menos malabares/i })).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    try {
      localStorage.setItem('cookie-consent', JSON.stringify({ essential: true }));
      localStorage.setItem('costpro-promo-dismissed', 'true');
    } catch { /* noop */ }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('div.fixed.right-3 button')).toHaveCount(5, { timeout: 15000 });
  await page.locator('button:has-text("Aceptar todas")').click({ timeout: 5000 }).catch(() => { /* ya consentido */ });
  await page.waitForTimeout(600);
}

const pagerDots = (page: Page) => page.locator('div.fixed.right-3 button');
const activeDotIndex = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const btns = [...document.querySelectorAll('div.fixed.right-3 button')];
    return btns.findIndex((b) => b.getAttribute('aria-current') === 'true');
  });

/** Posición de reposo de una escena según el propio ScrollTrigger (ADN-006). */
async function sceneScrollY(page: Page, sceneIdx: number): Promise<number> {
  return page.evaluate((k) => window.__cinemaSceneScrollY(k), sceneIdx);
}

test.describe('ADN-LANDING-HERO-AND-PAGER-FIX-004 — paginador lateral (escritorio, escenario ADN-006)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('1. el landing carga y el paginador presenta 5 puntos accesibles', async ({ page }) => {
    await openLanding(page);
    for (let i = 0; i < 5; i++) {
      await expect(pagerDots(page).nth(i)).toHaveAttribute('aria-label', LABELS[i]);
    }
  });

  test('2. guard anti-drift: los 5 sectionIds existen en el DOM y son únicos', async ({ page }) => {
    await openLanding(page);
    for (const id of SECTION_IDS) {
      const count = await page.evaluate((sectionId) => document.querySelectorAll(`#${sectionId}`).length, id);
      expect(count, `id="${id}" debe existir exactamente una vez`).toBe(1);
    }
  });

  for (let idx = 0; idx < SECTION_IDS.length; idx++) {
    test(`3.${idx + 1} clic en el punto ${idx + 1} (${LABELS[idx]}) aterriza en su capítulo exacto`, async ({ page }) => {
      await openLanding(page);
      // Parte del final para que el desplazamiento hacia atrás/adelante sea medible
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
      const expectedY = await sceneScrollY(page, idx === 0 ? 0 : [1, 10, 11, 13][idx - 1]);
      expect(expectedY, `posición de reposo del capítulo ${idx + 1}`).toBeGreaterThan(0);

      await pagerDots(page).nth(idx).click();
      // El goto del escenario desplaza por ScrollToPlugin y el snap completa
      // al reposo EXACTO del capítulo
      await expect
        .poll(async () => page.evaluate(() => window.scrollY), { timeout: 12000, intervals: [250, 400, 600] })
        .toBeLessThan(expectedY + LANDING_TOLERANCE + 1);
      const finalY = await page.evaluate(() => window.scrollY);
      expect(Math.abs(finalY - expectedY), `aterrizaje en ${expectedY}`).toBeLessThan(LANDING_TOLERANCE);

      // El capítulo aterrizado queda activo en el navegador
      await expect
        .poll(() => activeDotIndex(page), { timeout: 8000 })
        .toBe(idx);
    });
  }

  test('4. el punto activo se sincroniza al hacer scroll manual (rueda real)', async ({ page }) => {
    await openLanding(page);
    expect(await activeDotIndex(page)).toBe(0);
    await page.mouse.move(720, 450);
    /* Primeras escenas de cada capítulo (registro ADN-006):
       cap 2 → s1 · cap 3 → s10 · cap 4 → s11 · cap 5 → s13.
       En cada capítulo: aterrizar en su reposo (snap exacto) y golpear la
       rueda alrededor del reposo — el ajuste devuelve al mismo reposo y el
       dot debe permanecer sincronizado con la escena real. */
    const chapterFirstScene = [1, 10, 11, 13];
    for (let idx = 1; idx <= 4; idx++) {
      const target = await sceneScrollY(page, chapterFirstScene[idx - 1]);
      await page.evaluate((y) => window.scrollTo(0, y), target);
      await page.waitForTimeout(1100);
      await page.mouse.wheel(0, -140);
      await page.waitForTimeout(500);
      await page.mouse.wheel(0, 140);
      await page.waitForTimeout(1400);
      await expect
        .poll(() => activeDotIndex(page), { timeout: 8000 })
        .toBe(idx);
    }
    // Regreso: rueda hacia arriba desde el último capítulo
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -110); await page.waitForTimeout(30); }
    await page.waitForTimeout(1300);
    const back = await activeDotIndex(page);
    expect(back, 'el retroceso por rueda activa un capítulo anterior').toBeLessThan(4);
  });

  test('5. navegación con teclado: teclas 1-5 desplazan a los capítulos', async ({ page }) => {
    await openLanding(page);
    await page.keyboard.press('2');
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 8000 })
      .toBeGreaterThan(500);
    await expect.poll(() => activeDotIndex(page), { timeout: 8000 }).toBe(1);
    await page.keyboard.press('5');
    await expect.poll(() => activeDotIndex(page), { timeout: 8000 }).toBe(4);
    await page.keyboard.press('1');
    await expect.poll(() => activeDotIndex(page), { timeout: 8000 }).toBe(0);
  });
});

test.describe('ADN-LANDING-HERO-AND-PAGER-FIX-004 — paginador (móvil: drawer)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('6. en móvil el paginador no invade (oculto <lg) y el drawer navega las 5 secciones', async ({ page }) => {
    await openLanding(page);
    // El navegador lateral de puntos es desktop-only (hidden lg:flex)
    await expect(pagerDots(page).first()).toBeHidden();

    // El drawer conserva la navegación completa de 5 secciones
    await page.locator('button[aria-label="Abrir menú"]').click();
    for (let idx = 0; idx < LABELS.length; idx++) {
      await expect(page.getByRole('navigation').getByRole('button', { name: LABELS[idx] })).toBeVisible();
    }
    await page.getByRole('navigation').getByRole('button', { name: LABELS[1] }).click();
    const landed = await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 8000 })
      .toBeGreaterThan(500);
    void landed;
    // El drawer se cierra tras navegar y la sección Plataforma es alcanzable
    await expect(page.locator('button[aria-label="Cerrar menú"]')).toBeHidden();
  });
});

test.describe('ADN-LANDING-HERO-AND-PAGER-FIX-004 — identidad del hero', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('7. el nombre ADNegocio es visible en el primer pantallazo (firma del hero)', async ({ page }) => {
    await openLanding(page);
    // La firma del hero reutiliza el BrandWordmark: ADN verde + egocio blanco
    const brandSignatures = page.locator('span.text-white', { hasText: 'egocio' });
    await expect(brandSignatures.first()).toBeVisible();
    // La firma está dentro del primer viewport
    const inFirstScreen = await page.evaluate(() => {
      const masks = [...document.querySelectorAll('span.overflow-hidden')];
      const sign = masks.find((m) => m.textContent?.includes('ADNegocio'));
      if (!sign) return false;
      const r = sign.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 40;
    });
    expect(inFirstScreen, 'la firma ADNegocio debe estar íntegra en el primer pantallazo').toBe(true);
  });
});

test.describe('ADN-LANDING-TRUE-FULLPAGE-EXPERIENCE-006 — escenario persistente', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('8. el navegador muestra el contador 01/05 y el nombre del capítulo activo', async ({ page }) => {
    await openLanding(page);
    const counter = page.locator('[data-testid="act-pager"]');
    await expect(counter).toContainText('01');
    await expect(counter).toContainText('05');
    await expect(page.locator('[data-testid="act-dot-1"]')).toHaveAttribute('aria-current', 'true');
  });

  test('9. los 5 dots son clicables y el contador avanza capítulo a capítulo', async ({ page }) => {
    await openLanding(page);
    for (let idx = 1; idx < 5; idx++) {
      await page.locator('div.fixed.right-3 button').nth(idx).click();
      await expect
        .poll(() => activeDotIndex(page), { timeout: 10000, intervals: [250, 400, 600] })
        .toBe(idx);
      await expect(page.locator('[data-testid="act-pager"]')).toContainText(`0${idx + 1}`);
    }
  });

  test('10. teclado de capítulos: PageDown/PageUp avanzan y retroceden POR CAPÍTULO', async ({ page }) => {
    await openLanding(page);
    await page.keyboard.press('PageDown');
    await expect.poll(() => activeDotIndex(page), { timeout: 10000 }).toBe(1);
    await page.keyboard.press('PageDown');
    await expect.poll(() => activeDotIndex(page), { timeout: 10000 }).toBe(2);
    await page.keyboard.press('PageUp');
    await expect.poll(() => activeDotIndex(page), { timeout: 10000 }).toBe(1);
    await page.keyboard.press('End');
    await expect.poll(() => activeDotIndex(page), { timeout: 10000 }).toBe(4);
    await page.keyboard.press('Home');
    await expect.poll(() => activeDotIndex(page), { timeout: 10000 }).toBe(0);
  });

  test('11. la barra nativa está oculta visualmente y el scroll nativo sigue vivo', async ({ page }) => {
    await openLanding(page);
    const hidden = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return cs.scrollbarWidth === 'none';
    });
    expect(hidden, 'scrollbar-width: none en html:has(#landing-root)').toBe(true);
    // El desplazamiento nativo (rueda) sigue funcionando
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(900);
    const y = await page.evaluate(() => window.scrollY);
    expect(y, 'la rueda sigue desplazando el documento').toBeGreaterThan(400);
  });

  test('12. reduced-motion: sin escenario cinematográfico (flujo nativo) y todo alcanzable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLanding(page);
    const cinema = await page.evaluate(() => !!document.getElementById('cinema-stage'));
    expect(cinema, 'con prefers-reduced-motion el escenario NO se monta').toBe(false);
    // El contenido del capítulo 1 sigue presente y accesible
    await expect(page.getByRole('heading', { name: /menos malabares/i })).toBeVisible();
  });

  test('13. el escenario persiste fijado y las escenas se SUSTITUYEN (no hay página que baje)', async ({ page }) => {
    await openLanding(page);
    const probe = await page.evaluate(() => {
      const stage = document.getElementById('cinema-stage')!;
      const stageTop = stage.getBoundingClientRect().top;
      const scenes = stage.querySelectorAll('.cinema-scene');
      const sw = document.querySelector('.cinema-sweepline');
      return {
        stageTop,
        sceneCount: scenes.length,
        dataScenes: stage.dataset.scenes,
        sweepPresent: !!sw,
        stageRect: { w: stage.offsetWidth, h: stage.offsetHeight },
      };
    });
    expect(probe.sceneCount, '15 escenas (5 capítulos con subescenas)').toBe(15);
    expect(probe.dataScenes).toBe('15');
    expect(probe.stageRect.h, 'el escenario ocupa el viewport completo').toBe(900);

    // Recorrer DOS transiciones con rueda: el stage permanece pegado al tope
    // del viewport (fijado) — lo que cambia es el contenido dentro.
    const tops: number[] = [];
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(720, 450);
      for (let k = 0; k < 12; k++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(35); }
      await page.waitForTimeout(1300);
      tops.push(await page.evaluate(() => document.getElementById('cinema-stage')!.getBoundingClientRect().top));
    }
    for (const t of tops) {
      expect(Math.abs(t), 'el escenario queda pegado al tope del viewport (persistente)').toBeLessThan(40);
    }

    // En reposo, una única escena PINTA el escenario: visibilidad + opacidad +
    // geometría + sin recorte de cortina (los enter por máscara mantienen
    // autoAlpha 1 con clipPath 100% — su ocultación vive en el clip).
    const onStage = await page.evaluate(() => {
      const clipHides = (clip: string): boolean => {
        const m = clip.match(/inset\(([-\d.]+)%\s+([-\d.]+)%\s+([-\d.]+)%\s+([-\d.]+)%\)/);
        if (!m) return false;
        const [, t, rgt, b, l] = m.map(Number);
        return l >= 100 || rgt >= 100 || t >= 100 || b >= 100;
      };
      return [...document.querySelectorAll('.cinema-scene')].filter((p) => {
        const cs = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        return (
          cs.visibility === 'visible' &&
          +cs.opacity > 0.9 &&
          !clipHides(p.style.clipPath || '') &&
          // cubre el CENTRO del escenario (los push futuros están debajo:
          // top ≥ vh; los push pasados arriba: bottom ≤ 0)
          r.top < window.innerHeight * 0.5 &&
          r.bottom > window.innerHeight * 0.5
        );
      }).length;
    });
    expect(onStage, 'exactamente una escena ocupa el escenario en reposo').toBe(1);
    void probe.sweepPresent;
  });

  test('14. el snap ajusta al reposo exacto de la escena (labels del ScrollTrigger)', async ({ page }) => {
    await openLanding(page);
    // Scroll intermedio (a mitad de una transición) → el snap completa al label
    const midY = await page.evaluate(() => window.__cinemaSceneScrollY(0) + window.innerHeight * 0.5);
    await page.evaluate((y) => window.scrollTo(0, y), midY);
    await page.waitForTimeout(1400);
    const finalY = await page.evaluate(() => window.scrollY);
    const s1 = await page.evaluate(() => window.__cinemaSceneScrollY(1));
    expect(Math.abs(finalY - s1), 'el snap lleva al reposo exacto de la escena 1').toBeLessThan(LANDING_TOLERANCE);
    const dot = await activeDotIndex(page);
    expect(dot).toBe(1);
  });
});

test.describe('ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005/006 — responsive', () => {
  const viewports = [
    { width: 360, height: 740, label: '360px' },
    { width: 390, height: 844, label: '390px' },
    { width: 768, height: 1024, label: '768px' },
    { width: 1024, height: 768, label: '1024px' },
    { width: 1440, height: 900, label: '1440px' },
    { width: 1920, height: 1080, label: '1920px' },
  ];

  for (const vp of viewports) {
    test(`15. ${vp.label}: sin overflow horizontal y las 5 secciones alcanzables`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openLanding(page);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow, `sin scroll horizontal a ${vp.label}`).toBeLessThanOrEqual(0);

      // CP-FIX-LANDING-RESPONSIVE (2026-11-20): umbral de altura 700→620px
      // (viewport CSS efectivo). El viewport de Playwright NO tiene barra de
      // navegador: 1024×768 y 1440×900 entran al cine por altura; si el
      // CONTENIDO no cabe, la sonda del escenario cae a flujo por sí misma.
      const cinema = vp.width >= 1024 && vp.height >= 620;
      if (cinema) {
        // Escenario: los 5 ids existen y el recorrido por posiciones funciona
        for (const id of SECTION_IDS) {
          const found = await page.evaluate((sectionId) => !!document.getElementById(sectionId), id);
          expect(found, `#${id} presente a ${vp.label}`).toBe(true);
        }
        const last = await page.evaluate(() => window.__cinemaSceneScrollY(14));
        expect(last, 'escena final alcanzable por scroll').toBeGreaterThan(0);
      } else {
        // Flujo: scrollIntoView alcanza cada área
        for (const id of SECTION_IDS) {
          const found = await page.evaluate((sectionId) => {
            const el = document.getElementById(sectionId);
            if (!el) return false;
            el.scrollIntoView({ block: 'start', behavior: 'instant' });
            return el.getBoundingClientRect().top < window.innerHeight;
          }, id);
          expect(found, `#${id} alcanzable a ${vp.label}`).toBe(true);
        }
      }
    });
  }
});
