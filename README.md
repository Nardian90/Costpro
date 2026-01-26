# 🚀 Bienvenido a CostPro

CostPro es una aplicación integral de punto de venta (POS) y gestión de costos, diseñada para ofrecer una operativa fluida y eficiente.

## ✨ Pila de Tecnologías Real del Proyecto

Este proyecto está construido sobre una base tecnológica moderna y robusta:

*   **Framework Principal**: Next.js y React con TypeScript.
*   **Gestor de Paquetes**: `pnpm`.
*   **Backend y Base de Datos**: Supabase (PostgreSQL).
*   **Gestión de Migraciones**: Migraciones SQL nativas de Supabase.
*   **Autenticación y Seguridad**: Supabase Auth con Row-Level Security (RLS).
*   **Gestión de Estado**: Zustand para estado global y TanStack Query para estado de servidor.
*   **UI y Estilado**: Tailwind CSS y shadcn/ui.
*   **Testing**: Vitest y React Testing Library.

---

## 🚀 Guía de Inicio Rápido (La Verdadera)

Sigue estos pasos para levantar el entorno de desarrollo localmente. Un desarrollador debería poder estar operativo en menos de 30 minutos.

### 1. Prerrequisitos

*   Node.js (versión especificada en `.nvmrc`).
*   `pnpm` instalado (`npm install -g pnpm`).
*   Acceso al proyecto de Supabase.

### 2. Clonar el Repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd <NOMBRE_DEL_DIRECTORIO>
```

### 3. Instalar Dependencias

Usa `pnpm` para instalar las dependencias del proyecto.

```bash
pnpm install
```

### 4. Configurar Variables de Entorno

Crea un archivo `.env.local` a partir del ejemplo `.env.example`.

```bash
cp .env.example .env.local
```

Ahora, edita `.env.local` y añade las credenciales de Supabase. Necesitarás:

*   `NEXT_PUBLIC_SUPABASE_URL`: La URL de tu proyecto de Supabase.
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: La clave anónima (public) de tu proyecto.

```dotenv
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<id_proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu_anon_key>
```

### 5. Iniciar el Servidor de Desarrollo

Ejecuta el siguiente comando para iniciar la aplicación en modo de desarrollo.

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación en funcionamiento.

---

##  architecture: Supabase y Migraciones

La base de datos es gestionada por Supabase. **No se utiliza Prisma**.

*   **Schema**: La estructura de la base de datos se define y evoluciona a través de archivos de migración SQL.
*   **Ubicación de Migraciones**: Los scripts de migración se encuentran en el directorio `supabase/migrations/`.
*   **Aplicación de Migraciones**: Las migraciones se aplican a través del CLI de Supabase o desde el dashboard del proyecto. Es crucial mantener el proyecto local sincronizado con las últimas migraciones.
