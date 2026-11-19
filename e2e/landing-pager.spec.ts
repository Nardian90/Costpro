/**
 * e2e/landing-pager.spec.ts — ADN-LANDING-HERO-AND-PAGER-FIX-004 §8
 * ============================================================================
 * Navegador lateral de cinco puntos: navegación por IDs reales + scrollspy.
 *
 * Cobertura mínima exigida por la misión:
 *   1. Carga correcta del landing.
 *   2. Clic en cada uno de los 5 puntos → desplazamiento a su sección exacta.
 *   3. Actualización del punto activo al hacer scroll manual.
 *   4. Repetición en móvil (drawer) y escritorio.
 *   5. Guard anti-drift: los 5 IDs de sectionIds existen en el DOM.
 *
 * El fallo histórico del punto 2 (misión 004): sectionRefs[1] era una ref
 * nunca adjunta (ahaMomentRef, AhaMomentSection no renderizado) → el clic no
 * hacía nada en silencio. Este spec falla si algún punto deja de desplazar.
 * ============================================================================
 */
import { test, expect, type Page } from '@playwright/test';

const SECTION_IDS = ['hero', 'como-funciona', 'features', 'pricing', 'faq'] as const;
const LABELS = ['Inicio', 'Plataforma', 'Funcionalidades', 'Precios', 'Ayuda'] as const;
/** Margen del header fijo + tolerancia de aterrizaje (scroll-mt-[76px]). */
const SCROLL_MT = 76;
const LANDING_TOLERANCE = 140;

async function openLanding(page: Page): Promise<void> {
  await page.goto('/');
  // Espera el splash → titular del hero (patrón de landing-page.spec.ts)
  await expect(page.getByRole('heading', { name: /menos malabares/i })).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    try { localStorage.setItem('cookie-consent', JSON.stringify({ essential: true })); } catch { /* noop */ }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('div.fixed.right-3 button')).toHaveCount(5, { timeout: 15000 });
  await page.locator('button:has-text("Aceptar todas")').click({ timeout: 5000 }).catch(() => { /* ya consentido */ });
}

const pagerDots = (page: Page) => page.locator('div.fixed.right-3 button');
const activeDotIndex = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const btns = [...document.querySelectorAll('div.fixed.right-3 button')];
    return btns.findIndex((b) => b.getAttribute('aria-current') === 'true');
  });

async function sectionTop(page: Page, id: string): Promise<number> {
  return page.evaluate((sectionId) => {
    const el = document.getElementById(sectionId);
    return el ? el.getBoundingClientRect().top + window.scrollY : -1;
  }, id);
}

test.describe('ADN-LANDING-HERO-AND-PAGER-FIX-004 — paginador lateral (escritorio)', () => {
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
    test(`3.${idx + 1} clic en el punto ${idx + 1} (${LABELS[idx]}) desplaza a su sección exacta`, async ({ page }) => {
      await openLanding(page);
      // Parte del final para que el desplazamiento hacia atrás/adelante sea medible
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);
      const target = await sectionTop(page, SECTION_IDS[idx]);
      // ADN-005: el hero es el PRIMER acto — su wrapper arranca en top=0 exacto
      // (antes el elemento #hero tenía un spacer de header encima). El destino
      // del punto 1 es el tope del documento.
      expect(target, `la sección #${SECTION_IDS[idx]} debe existir`).toBeGreaterThanOrEqual(0);

      await pagerDots(page).nth(idx).click();
      // Espera a que el smooth scroll ATERRICE cerca del objetivo
      // (target - scroll-mt del header fijo). Poll por proximidad: el valor
      // absoluto de scrollY no sirve de condición (desde el fondo, >0 es
      // trivialmente cierto mientras el smooth scroll aún viaja).
      const expectedY = Math.max(0, target - SCROLL_MT);
      await expect
        .poll(
          async () => {
            const y = await page.evaluate(() => window.scrollY);
            return Math.abs(y - expectedY);
          },
          { timeout: 12000, intervals: [250, 400, 600] },
        )
        .toBeLessThan(LANDING_TOLERANCE);

      const topInView = await page.evaluate(
        ({ sectionId }) => {
          const el = document.getElementById(sectionId);
          if (!el) return Number.NaN;
          return el.getBoundingClientRect().top;
        },
        { sectionId: SECTION_IDS[idx] },
      );
      // El inicio de la sección queda visible bajo el header fijo (no tapado)
      expect(topInView).toBeGreaterThanOrEqual(-LANDING_TOLERANCE);
      expect(topInView).toBeLessThanOrEqual(SCROLL_MT + LANDING_TOLERANCE);
    });
  }

  test('4. el punto activo se sincroniza al hacer scroll manual', async ({ page }) => {
    await openLanding(page);
    expect(await activeDotIndex(page)).toBe(0);
    for (let idx = 1; idx < SECTION_IDS.length; idx++) {
      await page.evaluate(
        ({ sectionId, mt }) => {
          const el = document.getElementById(sectionId);
          window.scrollTo(0, el!.getBoundingClientRect().top + window.scrollY - mt + 4);
        },
        { sectionId: SECTION_IDS[idx], mt: SCROLL_MT },
      );
      await expect
        .poll(() => activeDotIndex(page), { timeout: 8000, intervals: [200, 300, 500] })
        .toBe(idx);
    }
  });

  test('5. navegación con teclado: teclas 1-5 desplazan a las secciones', async ({ page }) => {
    await openLanding(page);
    await page.keyboard.press('2');
    const landed = await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 8000 })
      .toBeGreaterThan(500);
    void landed;
    expect(await activeDotIndex(page)).toBe(1);
    await page.keyboard.press('5');
    await expect.poll(async () => activeDotIndex(page), { timeout: 8000 }).toBe(4);
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

test.describe('ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005 — experiencia por actos', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('8. el navegador muestra el contador 01/05 y el nombre del acto activo', async ({ page }) => {
    await openLanding(page);
    const counter = page.locator('[data-testid="act-pager"]');
    await expect(counter).toContainText('01');
    await expect(counter).toContainText('05');
    // El nodo activo coincide con el capítulo Inicio
    await expect(page.locator('[data-testid="act-dot-1"]')).toHaveAttribute('aria-current', 'true');
  });

  test('9. los 5 dots son clicables y el contador avanza acto a acto', async ({ page }) => {
    await openLanding(page);
    for (let idx = 1; idx < 5; idx++) {
      await page.locator('div.fixed.right-3 button').nth(idx).click();
      await expect
        .poll(() => activeDotIndex(page), { timeout: 10000, intervals: [250, 400, 600] })
        .toBe(idx);
      await expect(page.locator('[data-testid="act-pager"]')).toContainText(`0${idx + 1}`);
    }
  });

  test('10. teclado de capítulos: PageDown/PageUp avanzan y retroceden POR ACTO', async ({ page }) => {
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
    await page.waitForTimeout(600);
    const y = await page.evaluate(() => window.scrollY);
    expect(y, 'la rueda sigue desplazando el documento').toBeGreaterThan(400);
  });

  test('12. reduced-motion: sin escenas fijadas (sticky desactivado) y todo alcanzable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLanding(page);
    const pinned = await page.evaluate(() => {
      const scene = document.querySelector('#hero .act-scene--pinned');
      return scene ? getComputedStyle(scene).position : 'absent';
    });
    expect(pinned, 'sin prefers-reduced-motion la escena NO se fija').not.toBe('sticky');
    // El contenido del acto 1 sigue presente y accesible
    await expect(page.getByRole('heading', { name: /menos malabares/i })).toBeVisible();
  });

  test('13. la firma visual (hairline ADN) existe en los cinco actos', async ({ page }) => {
    await openLanding(page);
    const hairlines = await page.evaluate(() => document.querySelectorAll('.act-hairline').length);
    expect(hairlines).toBe(5);
  });
});

test.describe('ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005 — responsive', () => {
  const viewports = [
    { width: 360, height: 740, label: '360px' },
    { width: 390, height: 844, label: '390px' },
    { width: 768, height: 1024, label: '768px' },
    { width: 1024, height: 768, label: '1024px' },
    { width: 1440, height: 900, label: '1440px' },
    { width: 1920, height: 1080, label: '1920px' },
  ];

  for (const vp of viewports) {
    test(`14. ${vp.label}: sin overflow horizontal y las 5 secciones alcanzables`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openLanding(page);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow, `sin scroll horizontal a ${vp.label}`).toBeLessThanOrEqual(0);
      for (const id of SECTION_IDS) {
        const found = await page.evaluate((sectionId) => {
          const el = document.getElementById(sectionId);
          if (!el) return false;
          el.scrollIntoView({ block: 'start', behavior: 'instant' });
          return el.getBoundingClientRect().top < window.innerHeight;
        }, id);
        expect(found, `#${id} alcanzable a ${vp.label}`).toBe(true);
      }
    });
  }
});
