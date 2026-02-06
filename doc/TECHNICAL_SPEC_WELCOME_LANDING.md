# Especificación Técnica: Landing de Bienvenida (Vista Informativa)

## 1. Descripción General
**Propósito Estratégico:**
Transformar la puerta de entrada al sistema de un simple formulario de acceso a una experiencia de marca educativa y comercial. El objetivo es reducir la fricción de adopción, comunicar el valor real del software para MiPyMEs y posicionar a CostPro como una herramienta de automatización y escalabilidad, no solo como un punto de venta.

**Roles de Usuario Destinatarios:**
- Dueños de MiPyMEs buscando eficiencia.
- Gerentes de operaciones evaluando herramientas de control.
- Usuarios actuales que necesitan refuerzo sobre las capacidades del sistema.

---

## 2. Estructura de Secciones de la Landing

### A. Hero Section: Propuesta de Valor
- **Mensaje Principal:** "Protege tus Costos, Escala tu Negocio".
- **Sub-mensaje:** La plataforma integral para la gestión de MiPyMEs: desde el cálculo exacto de costos hasta la venta final en múltiples sucursales.
- **CTA Principal:** "Acceso al Sistema" (Abre el formulario de login).
- **Elemento Visual:** Logotipo animado de CostPro con un resplandor ambiental sutil.

### B. Módulos del Sistema (Showcase)
Reutilización estratégica de la lógica del Centro de Ayuda para presentar:
1. **Ingeniería de Costos:** Cálculo preciso con 14 secciones y 5 anexos.
2. **Multi-Tienda:** Aislamiento total de datos y jerarquía de roles.
3. **TPV (Punto de Venta):** Operativa Zero-Latency y optimización móvil.
4. **Logística e Inventario:** Recepciones protegidas y ajustes rápidos de merma.
5. **Jules AI:** Asistente inteligente para análisis de datos en tiempo real.

### C. Caso de Uso Protagonista: Generación Masiva
Bloque destacado que aborda el dolor operativo de la creación manual de fichas.
- **Contexto:** "El desafío de los 100 productos semanales".
- **Visual:** Diagrama animado SVG (Excel → Sistema → Fichas Listas).
- **Resultado:** Reducción del tiempo operativo de horas a menos de 5 minutos.

---

## 3. Narrativa del Caso de Uso MiPyME

**Escenario:**
Una MiPyME en crecimiento recibe semanalmente un promedio de 100 productos diferentes. Muchos de estos productos tienen costos de entrada variables debido a la fluctuación del mercado.

**El Problema:**
Crear manualmente 100 fichas de costo cada semana es una tarea titánica. El error humano en la transcripción de datos de un Excel o factura física a una herramienta de cálculo tradicional provoca:
- Margenes de ganancia mal calculados.
- Lentitud en la actualización de precios de venta.
- Cuellos de botella administrativos.

**La Solución CostPro:**
El usuario carga un archivo Excel simple con la relación Producto ↔ Costo Unitario. El motor de ingeniería de CostPro procesa el listado masivamente, aplicando automáticamente las reglas de gastos indirectos, impuestos y coeficientes definidos.

**Impacto:**
Lo que antes tomaba una jornada laboral completa, ahora se resuelve en lo que tarda en servirse un café. La empresa recupera agilidad comercial y precisión financiera.

---

## 4. Descripción Funcional de SVGs Animados

1. **SVG Flujo de Importación:**
   - **Elementos:** Icono de Excel, icono de "Cerebro/Sistema" de CostPro, y una pila de documentos (Fichas).
   - **Animación:** Partículas de datos fluyen del Excel al Sistema, y del Sistema emergen múltiples fichas organizadas a alta velocidad.
   - **Comunicación:** Automatización y procesamiento paralelo.

2. **SVG Reloj de Eficiencia:**
   - **Elementos:** Un cronómetro que retrocede rápidamente mientras una barra de progreso de "Generación" se llena al 100%.
   - **Animación:** El cronómetro se transforma en un check de "Completado" verde brillante.
   - **Comunicación:** Velocidad y liberación de tiempo para el negocio.

3. **SVG Escala de Negocio:**
   - **Elementos:** Un gráfico de barras que crece exponencialmente mientras el esfuerzo manual (representado por una mano) disminuye.
   - **Animación:** El crecimiento del gráfico es fluido y suave, reforzando la idea de escalabilidad sin dolor.
   - **Comunicación:** Crecimiento sostenible.

---

## 5. Flujo UX de Acceso (Login)

1. **Estado Inicial:** El usuario aterriza en la Landing Page informativa.
2. **Interacción:** El usuario presiona el botón "Acceso al Sistema".
3. **Transición:** Un modal elegante con desenfoque de fondo (backdrop-blur) emerge en el centro de la pantalla.
4. **Login:** Se muestra el formulario actual (Usuario/Contraseña/Demos).
5. **Persistencia:** Si el usuario ya está autenticado, la Landing muestra un botón "Ir al Dashboard" en lugar de "Acceso al Sistema", que redirige directamente a la terminal.
6. **Seguridad:** No se altera ninguna lógica de Supabase o Zustand.

---

## 6. Consideraciones de Diseño y Mantenibilidad

- **Stack:** Tailwind CSS para el layout, Framer Motion para animaciones.
- **Arquitectura:** Componente `WelcomeLanding` independiente.
- **Responsividad:** Enfoque Mobile-First, asegurando que el caso de uso y los SVGs sean legibles en pantallas pequeñas.
- **Consistencia:** Uso de la paleta de colores corporativa (Emerald/Green para éxito, Zinc/Slate para profesionalismo).
- **Hardening:** Tipado estricto en TypeScript para las props de navegación y estados del modal.
