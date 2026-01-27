# Dockerfile para n8n en Render
# Basado en la imagen oficial estable
FROM n8nio/n8n:latest

# Cambiar a usuario root si necesitas instalar paquetes adicionales
# USER root
# RUN apk add --no-cache graphicsmagick

# Volver al usuario node por seguridad (n8n usa este usuario por defecto)
USER node

# El puerto se configura vía variable de entorno N8N_PORT
# Render asignará automáticamente el puerto si se configura en el dashboard.
# Por defecto n8n usa 5678.
EXPOSE 5678

# El comando de inicio es el por defecto de la imagen oficial
CMD ["n8n", "start"]
