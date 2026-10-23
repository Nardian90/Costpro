# Referencia: Herramientas de Sistema

> **Necesita esto cuando**: Administra la plataforma y necesita el estado, el consumo, las fuentes de noticias o el cierre de periodos.

Las herramientas de la sección **Sistema** (Salud, Monitoreo, Gestión RSS, Cierre Fiscal) requieren rol **administrador**. El **Tablón de Noticias** (sección Análisis) está abierto a todos los roles.

## Salud

**Qué es**: el estado de los servicios de la plataforma en tiempo real: latencia de API, conexión a la base de datos y servicios externos.

**Dónde**: `Sistema → Salud`. Si algo del sistema "no responde", mire aquí primero antes de reportar la falla.

## Monitoreo

**Qué es**: el consumo estimado de los servicios (Vercel + Supabase), con alertas antes de alcanzar límites (60/80/90 %) y forecast mensual.

**Dónde**: `Sistema → Monitoreo`. Ver también: *Cómo ver el uso del sistema* (en la sección Cómo Hacer).

## Tablón de Noticias

**Qué es**: lector de noticias económicas y fiscales (BCC, FMI, ONAT, Gaceta Oficial...) con detección de tasas de cambio. Es **transversal**: no depende de la tienda activa.

**Dónde**: `Análisis → Tablón de Noticias`.

## Gestión RSS

**Qué es**: configuración de los **feeds RSS externos** que alimentan el Tablón de Noticias (noticias fiscales, contables, regulatorias).

**Dónde**: `Sistema → Gestión RSS`.

**Cómo usarla**:

1. Abra **Gestión RSS**.
2. Revise las fuentes existentes: **Fuente**, **Categoría**, **Estado** y **Acciones**.
3. Agregue la URL del feed que desea incorporar y asígnele categoría.
4. Las noticias nuevas aparecen después en el Tablón de Noticias.

## Cierre Fiscal

**Qué es**: el cierre de periodo fiscal con consolidación mensual. El **bloqueo de inmutabilidad** es una acción de administrador aparte, posterior al cierre: primero se cierra el periodo y después se bloquea para que nadie pueda modificar los documentos cerrados.

**Dónde**: `Sistema → Cierre Fiscal`.

**Cómo usarlo**:

1. Abra **Cierre Fiscal**.
2. Revise el **Balance de Caja** y la consolidación del periodo a cerrar.
3. Confirme el cierre del periodo mensual.

**Precauciones**:

- **Cerrar** un periodo no impide aún las modificaciones: para protegerlo del todo, un administrador debe usar después **Bloquear Periodo**.
- Un periodo **bloqueado** no se reabre desde la interfaz.
- Cierre solo cuando el mes esté completamente conciliado (ventas, caja, devoluciones).

## Preguntas frecuentes

**¿Puedo reabrir un periodo cerrado?**
- No por diseño: la inmutabilidad es la garantía del cierre fiscal. Documente cualquier corrección como ajuste del periodo abierto.

**¿Las noticias del Tablón consumen datos de mi tienda?**
- No: el Tablón es informativo y transversal.
