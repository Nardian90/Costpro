# ADN-BRAND-REBUILD-001 — HELP CENTER BRANDING REPORT

**Fecha:** 2026-11-18 · **Fase:** 5 — Centro de Ayuda

## 1. Alcance

La ayuda se sirve por filesystem vía `/api/help-docs` desde `knowledge/help/`
(Diátaxis: 01-empezar, 01-tutoriales, 02-como-hacer, 02-gestion, 03-inventario,
03-referencia, 04-configuracion, 04-explicacion, compliance). Es una superficie
de usuario de primera clase y contenía **194 menciones de COSTPRO en 42 archivos md**.

## 2. Sustituciones realizadas

| Patrón original | Sustituido por | Criterio |
|---|---|---|
| `CostPro Enterprise S.L.` (razón social en compliance) | `ADNegocio S.L. (anteriormente CostPro Enterprise S.L.)` | Nota histórica conservada por contexto legal |
| `CostPro Enterprise` | `ADNegocio` | Marca comercial |
| `CostPro` / `COSTPRO` (producto) | `ADNegocio` | Marca comercial |
| `costpro.midominio.com` (ejemplo de tutorial) | `app.adnegocio.cu` (con nota de que el dominio lo da el administrador) | Ejemplo neutro |
| `tienda-costpro` (ejemplo de slug) | `tienda-central` | Ejemplo neutro |

- **42 archivos** actualizados, con revisión de contexto archivo por archivo
  (sin sustitución global ciega).
- `01-empezar/introduccion.md`: nota histórica «ADNegocio (anteriormente **CostPro**)».
- `03-referencia/01-glosario.md`: nueva entrada **ADNegocio** que explica la
  denominación actual, la histórica y por qué los documentos ya emitidos y los
  identificadores técnicos conservan el nombre antiguo por trazabilidad.

## 3. Referencias que se conservan JUSTIFICADAS (12)

1. **Correos de contacto reales** (11 apariciones en `compliance/`): `privacy@costpro.app`,
   `privacidad@costpro.app`, `soporte@costpro.app`. Son direcciones de correo
   operativas del DPO/soporte; renombrarlas sin crear los buzones reales rompería
   el canal de contacto de privacidad. Pendiente del propietario: crear los
   buzones `*@adnegocio.*` equivalentes y migrar las plantillas.
2. **Nota histórica** (1): `01-empezar/introduccion.md` — «ADNegocio (anteriormente CostPro)»,
   exigida por la misión §8 para el contexto de evolución de marca.

## 4. Cabeceras de la UI de ayuda (mismo PR)

`HelpLayout`, `HelpContent`, `HelpSidebar`, `AccessibilityStatement` rebrandeados
en la fase 4 (© ADNegocio, "ADNegocio Help Engine", versión sin «Enterprise»).

## 5. Capturas de pantalla de ayuda

`public/help/capturas/*.webp` (24 imágenes) muestran la interfaz con el branding
anterior en el sidebar. **No se regeneraron en este PR**: el script oficial
(`scripts/help-captures.mjs`) inicia sesión contra la base de producción con la
cuenta admin protegida — por seguridad (misión §15 y protocolo §9) se requiere
aprobación del propietario para ejecutarlo, o regenerarlas contra la BD aislada.
Documentado como pendiente justificado en el informe final.
