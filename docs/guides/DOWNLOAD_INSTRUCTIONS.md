# 📥 Cómo Descargar POS Enterprise Neumórfico

## Opción A: Desde tu máquina local (si tienes acceso SSH)

```bash
# 1. Copia el archivo a tu máquina:
scp z@<tu-servidor>:/home/z/pos-enterprise-neumorphic.tar.gz .

# 2. Descomprime:
tar -xzf pos-enterprise-neumorphic.tar.gz

# 3. Entra al proyecto:
cd my-project

# 4. Instala dependencias:
bun install

# 5. Ejecuta el servidor:
bun run dev
```

## Opción B: Si estás en el servidor

El archivo ya está listo en: `/home/z/pos-enterprise-neumorphic.tar.gz`

```bash
# 1. Copia el archivo a donde quieras:
cp /home/z/pos-enterprise-neumorphic.tar.gz ~/Desktop/

# 2. Descomprime:
tar -xzf ~/Desktop/pos-enterprise-neumorphic.tar.gz

# 3. Entra al proyecto:
cd ~/Desktop/my-project

# 4. Instala dependencias:
bun install

# 5. Ejecuta el servidor:
bun run dev
```

## Opción C: Crear un nuevo proyecto limpio

Si prefieres copiar solo los archivos importantes:

```bash
# Crea un directorio nuevo
mkdir ~/mi-pos-project
cd ~/mi-pos-project

# Copia los archivos importantes
cp /home/z/my-project/src ./ -r
cp /home/z/my-project/package.json ./
cp /home/z/my-project/tsconfig.json ./
cp /home/z/my-project/tailwind.config.ts ./
cp /home/z/my-project/next.config.ts ./
cp /home/z/my-project/postcss.config.mjs ./
cp /home/z/my-project/eslint.config.mjs ./
cp /home/z/my-project/prisma ./ -r
cp /home/z/my-project/README_POS.md ./

# Instala dependencias
bun install

# Ejecuta el servidor
bun run dev
```

## 🎯 Para ejecutar localmente:

```bash
# 1. Entra al proyecto
cd my-project

# 2. Instala dependencias
bun install

# 3. Ejecuta el servidor
bun run dev

# 4. Abre tu navegador
# http://localhost:3000
```

## 🔐 Cuentas de Demo

| Rol | Email | Contraseña |
|-----|-------|-----------|
| Administrador | `admin@demo.com` | `demo123` |
| Encargado | `encargado@demo.com` | `demo123` |
| Cajero | `cajero@demo.com` | `demo123` |
| Almacén | `almacen@demo.com` | `demo123` |

## 📋 Archivos Importantes

El archivo comprimido incluye:
- ✅ Código fuente completo (`src/`)
- ✅ Sistema de diseño neumórfico (`globals.css`)
- ✅ Tipos TypeScript (`types/`)
- ✅ Estado global con Zustand (`store/`)
- ✅ Páginas de login y aplicación
- ✅ Configuración de Next.js y Tailwind
- ❌ `node_modules` (se reinstalan con `bun install`)
- ❌ `.next` (se genera con `bun run dev`)
- ❌ `.git` (si existe)

