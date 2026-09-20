# GATE 0 — AUDITORÍA READ-ONLY: Entrada del Landing COSTPRO
Fecha: 2026-09-20 · Commit base: e2c79d4d · Estado: servidor pm2 online (development)

## 1. INVENTARIO DE PUERTAS DE ENTRADA (23 elementos auditados)

| # | Acción actual | Ubicación | Destino | Requiere Auth | Qué hace realmente | Redundante |
|---|---------------|-----------|---------|---------------|--------------------|-----------|
| 1 | Iniciar Sesión | Header desktop | LoginModal (tab login) | No | Abre login COSTPRO | **SÍ** — duplica #7 |
| 2 | Ver demo interactiva de CostPro | Header desktop | InteractiveDemoModal | No | Demo modal | **SÍ** — duplica #9 |
| 3 | Cómo funciona / Funciones / Precios / FAQ | Header desktop | scroll a sección | No | Navegación | No (navegación) |
| 4 | Iniciar Sesión | Drawer móvil | LoginModal | No | Login | **SÍ** — 2ª copia |
| 5 | Ver demo interactiva | Dropdown móvil del hero | Demo | No | Demo | **MUERTO** — queda bajo el drawer (bug B1) |
| 6 | Crear Ficha de Costo — Gratis | Dropdown móvil del hero | enterFichaDeCosto | Decide en click | Flujo FC | **MUERTO** — bajo el drawer |
| 7 | Iniciar en COSTPRO | Hero CTA 1 (primario verde) | LoginModal | No (sin check) | Login | No (camino A) |
| 8 | Crear Ficha de Costo — Gratis | Hero CTA 2 (petróleo) | sesión→/fc/ · sin→login+returnTo | Decide en click | Flujo FC | No (camino B) |
| 9 | Ver demostración completa | Hero CTA 3 (outline) | InteractiveDemoModal | No | Demo | No (camino C) |
| 10 | Iniciar en COSTPRO | ServicesStory CTA final | evento open-login | No | Login | **SÍ** — 2ª copia de A |
| 11 | Ver funciones | ServicesStory | scroll #features | No | Navegación | No |
| 12 | CREAR MI CUENTA GRATIS | Pricing plan Gratis | onSignup → tab registro | No | Registro COSTPRO | Copy confuso fuera de contexto pricing |
| 13 | ESCRIBIR POR WHATSAPP ×2 | Pricing planes pagos | wa.me | No | Contacto ventas | No (propósito distinto) |
| 14 | CREAR MI CUENTA GRATIS | FinalCTA | onSignup → registro | No | Registro | **SÍ** — 2ª copia de #12 |
| 15 | EXPLORAR LA DEMOSTRACIÓN | FinalCTA | Demo | No | Demo | **SÍ** — 3ª copia de C |
| 16 | Escribir por WhatsApp | FinalCTA | wa.me | No | Contacto | No |
| 17 | Iniciar Sesión | CommandPalette (⌘K) | LoginModal | No | Acceso rápido | Aceptable (utility) |
| 18 | Ver Demo | CommandPalette | Demo | No | Acceso rápido | Aceptable (utility) |
| 19 | Contactar Ventas | CommandPalette | ContactModal | No | Contacto | No |
| 20 | Crear cuenta gratis | DemoModal footer | open-login register | — | — | **CÓDIGO MUERTO** — DemoModal no está montado (bug B2) |
| 21 | Comenzar Gratis | /demo/executive | Link → / | No | Vuelve al landing sin contexto | **Copy heredado prohibido** (PROMPT 3) |
| 22 | Volver | /demo/executive | Link → / | No | Navegación | No |
| 23 | Saltar al contenido | Skip link | #main-content | No | Accesibilidad | No |

## 2. LAS TRES INTENCIONES — cobertura actual

### A — ACCEDER A COSTPRO
- Hoy: #1 (header), #7 (hero), #10 (story), #4 (drawer) — **4 puertas** para la misma intención, con 2 labels distintos («Iniciar Sesión» vs «Iniciar en COSTPRO»).
- Flujo real: LoginModal → Supabase (email o Google) → router.push(returnTo||'/') → HomePageClient muestra app shell.
- **Gap**: la tarjeta A no verifica sesión (landing solo se renderiza sin auth, edge case menor con token en localStorage).

### B — FICHA DE COSTO GRATIS
- Hoy: #8 (hero) correcto y sin recarga (enterFichaDeCosto), #6 muerto bajo drawer.
- Flujo real: con sesión → /fc/; sin sesión → replaceState returnTo=/fc/ + LoginModal → Google o «Usar como invitado» (solo si isFcFlow) → /fc/?guest=1.
- **Gap**: el CTA no explica QUÉ ES FC ni que pertenece a COSTPRO; parece «otro botón de login». Solo se diferencia por color (petróleo), violando «no color como único mecanismo».

### C — VER DEMOSTRACIÓN
- Hoy: #2 (header), #9 (hero), #15 (FinalCTA), #18 (palette) — **4 puertas**.
- Flujo real: InteractiveDemoModal (demo autopilot con escenas; solo tiene replay, **sin CTA de conversión al terminar**).
- Superficie /demo/executive (solo por URL) con copy heredado «Comenzar Gratis».

## 3. VALIDACIÓN DE TARJETAS (decisión UX)

**Veredicto: SÍ a 3 tarjetas — pero asimétricas y con estructura diferencial.**

El problema no es la cantidad de botones sino que los 3 CTAs del hero comparten la MISMA forma (píldora), peso visual similar y solo se distinguen por color. El usuario no puede responder «¿qué elijo?» sin leer los 3 textos. Las tarjetas permiten diferenciarse por ESTRUCTURA (título+descripción+icono+acción+contexto), no solo color — exactamente lo que exige el mandato. Riesgos controlados: (a) tres tarjetas idénticas reproducirían el problema → jerarquía asimétrica obligatoria; (b) tarjetas gigantes en móvil → altura máxima y stack compacto; (c) el header NO repetirá las acciones (regla: cada CTA función única).

## 4. JERARQUÍA DERIVADA (no arbitraria)

- **Primaria — Ficha de Costo gratis**: es la única promesa «gratis» real del producto (con invitado, sin tarjeta), el diferenciador normativo (Res. 148/2023) y el gancho de adquisión del negocio. El visitante la entiende sin saber nada de COSTPRO.
- **Secundaria — Entrar a COSTPRO**: intención de mayor compromiso, para quien ya conoce la plataforma (usuarios recurrentes; minoría en landing).
- **Exploratoria — Ver demostración**: cero fricción, para quien aún no decide; no exige registro.

## 5. BUGS ENCONTRADOS (GATE 0)

| ID | Severidad | Descripción |
|----|-----------|-------------|
| B1 | Alta | Doble menú móvil: el hamburger abre a la vez el drawer lateral (LandingPage z-70/80) Y el dropdown del hero (HeroSection z-50) — el dropdown queda muerto bajo el overlay; duplica enlaces para screen readers. Verificado en vivo: drawerLateral:1, dropdownHero:1, overlay:1. |
| B2 | Media | DemoModal + demoSlides = código muerto con CTA roto («Crear cuenta gratis») — no montado en ningún árbol. |
| B3 | Media | Login modal no conserva contexto de origen: siempre «Iniciar sesión / Ingresa tus credenciales…» aunque el usuario venga del camino FC. |
| B4 | Baja | Hamburger móvil con hit-target interferido (agent-browser reporta #hero cubriendo el click point). Revisar en GATE 1. |
| B5 | Baja | Copy heredado «Comenzar Gratis» vivo en /demo/executive (mandato PROMPT 3 lo prohíbe). |

## 6. AUDITORÍA DE COPY «GRATIS» (clasificación)

| Aparición | Texto | Veredicto |
|-----------|-------|-----------|
| Promo banner | «…Gratis para empezar» | Vago — ¿qué es gratis? → aclarar |
| Hero subtext | «…Gratis para empezar» | Vago → integrará el «gratis» real de FC |
| Hero FC CTA | «Crear Ficha de Costo — Gratis» | CORRECTO (significado real) |
| Mobile dropdown FC | «Crear Ficha de Costo — Gratis» | Correcto pero muerto (B1) |
| ServicesStory | «Crea tu cuenta gratis y configura tu primera tienda…» | Mezcla producto completo con FC → alinear a camino B |
| Pricing header | «Comienza gratis y escala…» | Aceptable en contexto pricing |
| Pricing plan Gratis | «Crear mi cuenta gratis» | Correcto en pricing (registro COSTPRO) |
| FinalCTA | «Gratis. Sin tarjeta.» + «Crear mi cuenta gratis» | Correcto en cierre |
| DemoModal (muerto) | «Crear cuenta gratis» | Eliminar con B2 |
| /demo/executive | «Comenzar Gratis» | PROHIBIDO (heredado) → reemplazar |

## 7. MAPA DE RUTAS VALIDADO (estados)

```
authenticated → landing no se renderiza (HomePageClient muestra app shell);
                 FC CTA con token → /fc/ directo (hasCostproSession)
unauthenticated → landing; A→login→'/' (app); B→login(Google|invitado)→/fc/; C→demo modal
guest           → FC_GUEST_MODE_V1=1 → /fc/?guest=1 (modo local, 0 Supabase)
offline         → /fc/ offline-first intacto (NO tocado); landing requiere red (documentado)
online          → flujos completos
returnTo        → allowlist ['/fc/','/fc'] en navigation.ts (open-redirect protegido) — NO se amplía
```

## 8. ARCHIVOS (GATE 1)

**MODIFICAR:**
- `src/components/landing/HeroSection.tsx` (header sin CTAs duplicados; selector de 3 caminos; eliminar dropdown móvil duplicado — B1)
- `src/app/LandingPage.tsx` (drawer móvil: solo navegación)
- `src/components/auth/LoginForm.tsx` (contexto FC — B3)
- `src/components/landing/ServicesStorySection.tsx` (CTA final alineado a camino B)
- `src/components/landing/Modals.tsx` (eliminar DemoModal — B2)
- `src/components/landing/data.ts` (limpiar demoSlides huérfano)
- `src/components/landing/InteractiveDemoModal.tsx` (conversión contextual al terminar demo)
- `src/components/views/executive-demo/ExecutiveDemoView.tsx` (copy heredado — B5)

**NO MODIFICAR:** motor normativo FC, fórmulas, Supabase RLS, esquema, Multi-Tienda, inventario, POS, auth global, Service Worker, sync, cálculo, almacenamiento offline, wrapper /fc/, src/lib/fcEntry.ts, src/lib/navigation.ts.

**COMPARTIDOS-CRÍTICOS (solo lectura):** useAuthStore, supabaseClient, safeReturnTo/returnToFromLocation, enterFichaDeCosto.

## 9. RIESGOS

- Auth: el selector reutiliza EXACTAMENTE los handlers existentes (open-login, enterFichaDeCosto) — cero lógica nueva de sesión.
- Offline: no se toca SW/FC/localStorage (excepto lectura FC_GUEST ya existente).
- Landing SEO: h1 y estructura se mantienen; tarjetas son <a>/<button> reales.
- Regresión B1: al quitar el dropdown del hero, el drawer lateral (ya accesible) queda como único menú móvil.
