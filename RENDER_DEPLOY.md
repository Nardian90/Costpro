# Guía de Despliegue de n8n en Render 🚀

Esta guía detalla los pasos para desplegar tu repositorio custom de n8n en **Render** de forma profesional, garantizando estabilidad y persistencia de datos.

## 1. Preparación del Repositorio

Asegúrate de que los archivos generados están en tu rama principal:
- `Dockerfile`
- `.gitignore`
- `.env.template`

### Push a GitHub
Si aún no has subido los cambios:
```bash
git add .
git commit -m "Setup: Configuración profesional para despliegue en Render"
git push origin master
```

---

## 2. Configuración en Render

### Paso A: Crear el Web Service
1. Entra a tu dashboard de [Render](https://dashboard.render.com/).
2. Haz clic en **New +** y selecciona **Web Service**.
3. Conecta tu repositorio `n8n-custom`.
4. Configura los detalles básicos:
   - **Name:** `n8n-custom` (o el que prefieras).
   - **Region:** Elige la más cercana a tus usuarios (ej. `Ohio (us-east-2)` o `Frankfurt (eu-central-1)`).
   - **Branch:** `master`.
   - **Runtime:** `Docker`.

### Paso B: Variables de Entorno (Environment Variables)
En la sección **Environment**, añade las siguientes variables:

| Key | Value | Nota |
| :--- | :--- | :--- |
| `N8N_BASIC_AUTH_ACTIVE` | `true` | Activa la seguridad básica |
| `N8N_BASIC_AUTH_USER` | `admin` | Tu usuario |
| `N8N_BASIC_AUTH_PASSWORD` | `Darian9004*` | **¡Cámbiala en producción!** |
| `N8N_PORT` | `5678` | Puerto interno |
| `GENERIC_TIMEZONE` | `America/Lima` | Zona horaria |
| `WEBHOOK_URL` | `https://tu-app.onrender.com/` | URL final (incluye / al final) |
| `NODE_ENV` | `production` | Entorno |

### Paso C: Persistencia de Datos (¡Crucial!)
Render borra los archivos locales cada vez que se despliega una nueva versión. Para evitar perder tus workflows y credenciales:

1. Ve a la pestaña **Disks**.
2. Haz clic en **Add Disk**.
3. Configuración:
   - **Name:** `n8n-data`
   - **Mount Path:** `/home/node/.n8n`
   - **Size:** `1GB` (Suficiente para empezar).
4. Haz clic en **Save Changes**.

---

## 3. Base de Datos Externa (Recomendado para Producción)

Para una estabilidad máxima, se recomienda usar una base de datos PostgreSQL en lugar de SQLite (el disco persistente).

1. Crea una base de datos **PostgreSQL** en Render.
2. Copia la **Internal Database URL**.
3. En tu Web Service de n8n, añade estas variables:
   - `DB_TYPE` = `postgresdb`
   - `DB_POSTGRESDB_DATABASE` = (nombre de la db)
   - `DB_POSTGRESDB_HOST` = (host interno)
   - `DB_POSTGRESDB_PORT` = `5432`
   - `DB_POSTGRESDB_USER` = (usuario)
   - `DB_POSTGRESDB_PASSWORD` = (password)

---

## 4. Mantenimiento y Actualizaciones

- **Actualizar n8n:** Para actualizar a la última versión, solo tienes que hacer un nuevo despliegue. La imagen de Docker en el `Dockerfile` usa `:latest`, por lo que Render descargará la última versión estable cada vez que compiles.
- **Logs:** Puedes ver los logs en tiempo real en la pestaña **Logs** de Render.
- **Escalado:** Si necesitas más potencia, puedes subir el Plan de Render (RAM/CPU) en la pestaña **Settings**.

---

## 5. Notas de Seguridad
- Nunca compartas tu archivo `.env`.
- Cambia la contraseña de `BASIC_AUTH` periódicamente.
- Considera configurar el **User Management** propio de n8n una vez desplegado para mayor control.
