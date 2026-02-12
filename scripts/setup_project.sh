#!/bin/bash
echo "🔧 Configurando POS Enterprise Neumórfico..."
echo ""

# 1. Crear directorio de destino
echo "📁 Creando directorio..."
mkdir -p ~/pos-neumorphic-app
cd ~/pos-neumorphic-app

# 2. Copiar archivos esenciales
echo "📋 Copiando archivos..."
cp /home/z/my-project/src ./ -r
cp /home/z/my-project/public ./ -r
cp /home/z/my-project/prisma ./ -r
cp /home/z/my-project/*.json ./
cp /home/z/my-project/*.ts ./
cp /home/z/my-project/*.mjs ./

# 3. Crear archivo .gitkeep para directorios vacíos
touch .gitkeep

echo ""
echo "✅ Archivos copiados exitosamente!"
echo ""
echo "📝 Instrucciones:"
echo ""
echo "1. Entra al directorio:"
echo "   cd ~/pos-neumorphic-app"
echo ""
echo "2. Instala dependencias:"
echo "   bun install"
echo ""
echo "3. Ejecuta el servidor:"
echo "   bun run dev"
echo ""
echo "4. Abre tu navegador:"
echo "   http://localhost:3000"
echo ""
echo "🔐 Cuentas de demo:"
echo "   Admin: admin@demo.com / demo123"
echo "   Encargado: encargado@demo.com / demo123"
echo "   Cajero: cajero@demo.com / demo123"
echo "   Almacén: almacen@demo.com / demo123"
echo ""
echo "🎯 ¡Listo para usar!"
