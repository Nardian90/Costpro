# guardias.md — Registro de guardias del watchdog (nivel 2)

Una sección por ejecución del schedule «Gaceta Watchdog». La entrada más
recente abajo. Formato: fecha-hora UTC, salida literal de la medición antes,
decisión, acción de reparación, salida después, resultado, huecos históricos.

---

## 2026-11-27T20:45Z — guardia fundacional (instalación de la cadena)

- Contexto: instalación de la misión ADN-GACETA-WATCHDOG-001; esta primera
  guardia corre manualmente (por el agente instalador) y además repara el
  hueco del día detectado durante el diagnóstico.
- Medición ANTES (salida literal de `node scripts/gaceta/verify-gaceta-daily.mjs --verbose`):
  ```
  [verify-gaceta-daily] Ediciones visibles en public_gaceta_v: 2
    2026-11-24 | gaceta | Cambia el juego de las pensiones: lo que tu MIPyme debe sabe…
    2026-11-24 | costpro | Tu margen no se defiende en la caja: el informe que te dice…
  [verify-gaceta-daily] Hoy (La Habana): 2026-11-27
  [verify-gaceta-daily] Edición de hoy publicada: NO
  [verify-gaceta-daily] Última fecha publicada: 2026-11-24
  [verify-gaceta-daily] Huecos últimos 7 días: 2026-11-26, 2026-11-25, 2026-11-23, 2026-11-22, 2026-11-21, 2026-11-20
  [verify-gaceta-daily] RESULTADO: HUECO — falta la edición de hoy 2026-11-27 (el publicador del Diario Contable no ha publicado).
  ```
- Decisión: HUECO del día → PASO 2 (publicar edición del 2026-11-27).
- Acción: se rellenará en la sección de reparación de abajo tras el INSERT.

## 2026-11-27T20:52Z — guardia fundacional, reparación del hueco del día

- Decisión: HUECO del día → PASO 2 del entrypoint.
- Acción de reparación: edición del 2026-11-27 publicada por INSERT idempotente
  (service_role, tabla gaceta_posts), 2 notas:
  - `gaceta-2026-11-27-seguridad-social-en-vigor` (gaceta) — Decreto-Ley 140 +
    Decreto 186, GOC No. 97 del 18/11, en vigor desde el 25/11 (fuente PDF de la
    Gaceta citada). HTTP 201.
  - `costpro-2026-11-27-pagos-por-linea-y-cadena-de-vigilancia` (costpro) —
    pagos por línea de venta en el POS (PR #1708, desplegado el 25/11) + la
    instalación de esta cadena de vigilancia. HTTP 201.
- Medición DESPUÉS (salida literal):
  ```
  [verify-gaceta-daily] Ediciones visibles en public_gaceta_v: 4
    2026-11-27 | gaceta | Ya corren las nuevas reglas de seguridad social: la reforma …
    2026-11-27 | costpro | ADNegocio ya reparte cada pago a su línea de venta — y su pr…
    2026-11-24 | gaceta | Cambia el juego de pensiones: lo que tu MIPyme debe sabe…
    2026-11-24 | costpro | Tu margen no se defiende en la caja: el informe que te dice…
  [verify-gaceta-daily] Hoy (La Habana): 2026-11-27
  [verify-gaceta-daily] Edición de hoy publicada: SÍ
  [verify-gaceta-daily] Última fecha publicada: 2026-11-27
  [verify-gaceta-daily] RESULTADO: HUECO — hoy está publicado pero faltan días previos: 2026-11-26, 2026-11-25, 2026-11-23, 2026-11-22, 2026-11-21, 2026-11-20
  ```
  (El script reporta HUECO por los días PREVIOS sin edición; la misión del día
  está cumplida: edición de hoy publicada. Los días previos son decisión
  editorial del propietario, no se rellenan automáticamente.)
- Página en vivo verificada: `GET https://costpro4.vercel.app/gaceta` → HTTP 200,
  slugs del 27 visibles en el HTML y fecha «27 de noviembre de 2026» presente.
- Resultado: **REPARADA** (hueco del día 2026-11-27).
- Huecos históricos pendientes de decisión del propietario: 2026-11-25,
  2026-11-26 (días con la cadena caída y sin edición). Nota: el hueco
  2026-11-20..23 es anterior a la instalación del diario (migración ADN-011
  aplicada el 24/11) — no son huecos de la cadena, son días pre-historia de
  la función; se listan por transparencia del instrumento.
