# FASE C — C2 · 06 FC REGRESSION (§19/§21)

## 1. FC.html sin cambios estructurales

| Verificación | Resultado |
|---|---|
| `git diff -- public/fc/` (inicio y cierre) | **vacío** — cero modificaciones en FC.html, sw.js, manifest, wrapper |
| `git diff --name-only` completo | ningún archivo bajo `public/fc/` |
| Contrato FC (`data.model`/`ficha`/`category`/`meta2`) | intacto (escritor del bundle sin cambios) |
| Service Worker (`sw.js`, neverCache) | intacto y servido (`GET /fc/sw.js` → 200) |
| Guest mode / localStorage | intacto |
| Sincronización FC (GET/POST/PATCH/DELETE + guard `v(e)`) | intacta |
| `GET /fc/FC.html` en el server del entorno | 200 |

## 2. Los datos FC — verificación de intangibilidad (§14/§25)

- Hash SHA-256 del `data` + `updated_at` de los 7 documentos FC, capturados ANTES y DESPUÉS de toda la batería E2E (incluidos los intentos de actualización 404/409): **idénticos** → byte-intactos.
- Los 7 FC siguen clasificándose como familia FC y la biblioteca CostSheet los excluye (0 falsos positivos).
- FC.html sigue encontrando sus documentos: su pull no cambió y los ids/updated_at que sus clientes tienen en `FC_CLOUD_SHEETS_V1` no fueron alterados por C2.

## 3. Pruebas existentes relevantes (§21)

- Suite unitaria completa: 2227 passed / 0 fallos (incluye `fc-schemas.test.ts`, `fc-invalidate.test.ts` y demás baterías de fichas/FC Automatizada — todas verdes SIN modificaciones).
- La certificación offline completa de FC.html (FASE B) no se re-ejecuta: el bundle y su SW no sufrieron ni un byte de cambio (diff vacío), por lo que esa certificación sigue aplicando tal cual.

## 4. Conclusión

**FC.html no fue afectado por C2**: ni código, ni contrato, ni offline, ni sync, ni datos. La separación implementada opera exclusivamente en el lado terminal (`src/`) — exactamente como estableció C1R (C2-D/D8).
