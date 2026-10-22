# CHECKLIST DEL PROPIETARIO — COSTPROE2E (CP-INFRA-011)

**Proyecto aislado:** `CostproE2E` · **Ref:** `lguovmvrozxgssupkwpf`
Estado de la preparación (2026-10-22, agente): base PREPARADA y verificada
(baseline + tramo 70/70, centinela true, contrato 137/137, RLS 149/149).
Este checklist contiene los pasos que SOLO el propietario puede completar.
Responsables: **[P]** propietario · **[A]** agente (ya realizado).

---

## 1. Confirmar la referencia real del proyecto

- [ ] **[P]** Supabase → proyecto `CostproE2E` → **Settings → General →
  Reference ID**. Debe ser exactamente `lguovmvrozxgssupkwpf`. Si difiere,
  DETÉNGASE y notifique: toda la preparación quedó cifrada a este ref.

## 2. Verificar que NO es producción

- [ ] **[P]** Confirmar que el proyecto NO es `wthkddeleylijmonclxg`
  (producción) ni contiene datos reales. **[A]** Verificado: identidad
  consultada por Management API (nombre `CostproE2E`, us-east-1, creado
  2026-10-22) y estado inicial `public` VACÍO antes de la preparación
  (evidencia: `audit-evidence/INFRA-011/estado-inicial-remoto.json`).

## 3. Guardar credenciales en el gestor de contraseñas

- [ ] **[P]** Mover TODAS las credenciales compartidas por chat a su gestor de
  contraseñas y rotar las compartadas por texto: contraseña de BD, anon key,
  service_role key y (si se compartió) access token. Nada de eso debe volver
  a circular en claro. **[A]** Ninguna credencial fue commiteada: el escaneo de
  secretos sobre el diff del PR es parte de las verificaciones locales.

## 4. Configurar las variables y secretos (GitHub)

- [ ] **[P]** **Settings → Environments → New environment → `e2e-isolated`**
  (NO reutilizar `e2e`). Añadir los 4 secretos:

  | Secreto | Valor de dónde sale |
  |---|---|
  | `E2E_SUPABASE_URL` | Settings → API → Project URL |
  | `E2E_SUPABASE_ANON_KEY` | Settings → API → anon / publishable key |
  | `E2E_SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role (secret) |
  | `E2E_ALLOWED_REMOTE_REF` | Settings → General → Reference ID |

  PowerShell para volcar la URL y el ref sin abrir el dashboard:
  ```powershell
  $ref = "lguovmvrozxgssupkwpf"
  Write-Host "URL: https://$ref.supabase.co"
  ```

## 5. Proteger el environment (recomendado)

- [ ] **[P]** En el environment `e2e-isolated`: añadir **required reviewers**
  (usted) y restringir ramas (`main`) — misma práctica SEC-TS-08 aplicada al
  environment `e2e` antiguo.

## 6. Auth: Site URL y redirecciones (solo si un test lo requiere)

- [ ] **[P]** Solo si un test de login falla por redirect: en el proyecto
  CostproE2E → **Authentication → URL Configuration**: Site URL y redirect
  URLs del entorno de pruebas (no heredar las de producción sin revisar).

## 7. Confirmación de correo y límites de Auth (revisión por código)

- [ ] **[A]** Revisado: `e2e/fixtures/run-env.ts` crea usuarios vía Admin API
  con `email_confirm: true` (no depende de confirmación por correo) y no usa
  límites externos. Si en el futuro un fixture requiere OTP, revisar
  **Authentication → Providers/Rate limits** del proyecto aislado.

## 8. Ejecutar el procedimiento remoto desde un entorno seguro

- [ ] **[A]** La preparación ya fue ejecutada por el agente (2026-10-22):
  `--inspect` → `--bootstrap` → `--apply-replay` → `--verify` → `--contract`,
  con identidad verificada por Management API en cada fase y evidencia en
  `audit-evidence/INFRA-011/remote/`. **Re-ejecuciones:** cualquier
  re-preparación futura corre por cuenta del propietario desde su entorno con
  `SUPABASE_ACCESS_TOKEN` y `E2E_SUPABASE_DB_URL` locales (ver
  `docs/e2e/E2E_AISLADO.md` §6). El apilador es idempotente por hash.

## 9. Crear el environment `e2e-isolated`

- [ ] **[P]** (Igual al paso 4 — confirmar existencia antes de la primera corrida.)

## 10. Ejecutar el workflow manualmente

- [ ] **[P]** **Actions → "E2E Aislado (CostproE2E)" → Run workflow** con
  `target=project`. Verificar: paso "Validar configuración" verde (sin valores
  impresos), determinismo del manifiesto verde, "Verificar base aislada"
  verde (centinela true), suite smoke ejecutada. Repita hasta acumular
  **3 corridas verdes** (requisito para proponer trigger por PR en el futuro).

## 11. Consultar artefactos y resultados

- [ ] **[P]** Los artefactos de fallo solo se suben si habilita la variable
  `E2E_ISOLATED_UPLOAD_ARTIFACTS=true` (Settings → Secrets and variables →
  Actions → Variables) — convención SEC-TS-07 (repo público, trazas con JWTs
  de usuarios sintéticos, retención 1 día). Sin ella, los fallos se leen en
  el log de la corrida.

## 12. Pausa por inactividad y plan gratuito

- [ ] **[P]** El plan gratuito pausa proyectos inactivos. Si el proyecto
  CostproE2E se pausa, las corridas fallarán con 5xx en el healthcheck/REST:
  restaurar desde el dashboard y re-validar con `--verify` (idempotente,
  solo lectura). Decida la política de pausa (p. ej. reactivar antes de
  cada corrida manual).

## 13. Reconstrucciones destructivas

- [ ] **[P]** Ninguna reconstrucción (DROP de objetos, reset del proyecto,
  re-aplicación desde cero) está automatizada. Si alguna vez se requiere,
  autorícela de forma explícita y separada; el apilador actual se niega por
  diseño a reparar estados divergentes (mandato §6.3).

---

## Respuestas rápidas para el propietario

**¿Qué credenciales se necesitan realmente a futuro?**
1. Para **CI** (4 secretos): URL, anon key, service_role key, ref. Nada más.
2. Para **preparar/reconstruir la base** (local): además `SUPABASE_ACCESS_TOKEN`
   (verificación de nombre + transporte api) y/o `E2E_SUPABASE_DB_URL`
   (contraseña de BD, solo con `--transport=pg`).
3. **No volver a compartir credenciales por chat**; use el gestor de
   contraseñas y rote las ya compartidas.

**¿Qué NO se necesita?** Ninguna credencial de producción para nada de esto —
el guard las rechaza sin conectar.
