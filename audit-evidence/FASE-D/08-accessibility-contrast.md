# FASE D — 08 ACCESSIBILITY CONTRAST (tokens.css, solo :root)

## Cálculo WCAG (luminancia relativa, §15) — fondo de referencia #f8fafc

```text
warning:
  old:  #f59e0b → 2.05:1  FAIL (AA normal)
  new:  #b45309 → 4.80:1  PASS (AA normal)
success:
  old:  #10b981 → 2.42:1  FAIL (AA normal)
  new:  #047857 → 5.24:1  PASS (AA normal)
```

## Cambio aplicado (src/styles/tokens.css, bloque :root ÚNICAMENTE)

```css
--success: #047857;  /* era #10b981 — 2.42:1 FAIL → 5.24:1 PASS */
--warning: #b45309;  /* era #f59e0b — 2.05:1 FAIL → 4.80:1 PASS */
```

Con comentarios CSS `/* FIX-FASE-D A11Y … */` documentando los ratios.

## Alcance respetado

- `.dark` INTACTO (§16): `--success: #34d399` y `--warning: #fbbf24` sin cambios
  (verificado en el diff: solo 2 líneas + comentarios en :root).
- Otros tokens intactos (§17): `--destructive`, `--primary`, `--foreground`,
  `--muted-foreground`, `--success-light`, `--warning-light`, `--color-*` — sin tocar.
- `git diff --check` limpio.

## Análisis extra de rigor (fondos efectivos con tints)

```text
success NEW: 4.57–5.48:1 sobre bg-success/10 y /5 (page y card) → PASS en todos los usos reales.
warning NEW: 4.51–5.02:1 sobre bg-warning/5, page y card → PASS.
warning NEW: 4.19:1 sobre bg-warning/10 (tinte 10%) → por debajo de 4.5 en ESE combo
  concreto (uso real: hover de acción secundaria en StoreCard). Registrado como riesgo
  residual R-A11Y-1 (recomendación futura: bg-warning/5 en usos con texto, o tono
  #92400e si se requiere /10). El criterio del mandato (≥4.5 vs #f8fafc) SÍ se cumple.
```

## Componentes verificados (§18)

```text
1. BulkConfirmationFlow  → text-warning sobre bg-warning/5 (4.51–4.68:1 PASS) y card;
   flujo destructivo (bulk delete) NO ejecutado — verificación por tokens compartidos
   + matemática exacta de sus clases (líneas 257-269).
2. StoreCard badge "Activa" → screenshot 09 (light): color computado
   rgb(4,120,87) = #047857 sobre bg-success/10 → 4.78:1 PASS.
3. EditStoreModal "Slug disponible" → color computado rgb(4,120,87) = #047857 →
   5.48:1 sobre card → PASS (screenshot 10).
Tints inspeccionados: bg-warning/10, bg-success/10, border-warning/20,
border-success/20 — son FONDOS/BORDES (no texto): el cambio oscurece el tinte
ligeramente; sin efecto negativo en contraste de texto sobre ellos (ver tabla).
```

## Regresión visual (§20)

- Modo oscuro verificado ACTIVO durante parte de la sesión (badge computaba
  #34d399 = .dark sin cambios) → §16 demostrado en vivo.
- Sin regresiones visuales: los tokens solo afectan color de texto/tiltes;
  la suite completa (2236 tests) y la navegación no muestran diferencias
  estructurales. Capturas en screenshots/ (09, 10, 11-*).
- Tipografía/uppercase/tracking intactos (§19).
