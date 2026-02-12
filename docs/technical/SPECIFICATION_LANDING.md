# Especificación Técnica: Landing de Bienvenida (Vista Informativa)

## 1. Propósito Estratégico
Transformar el punto de entrada actual (Login) en una experiencia de marca educativa y comercial. El objetivo es reducir la fricción de entrada, comunicar el valor inmediato del sistema y posicionar a CostPro como una solución robusta y escalable para MiPyMEs, antes de solicitar credenciales.

## 2. Estructura de Secciones de la Landing

### A. Hero Section: Propuesta de Valor
- **Mensaje:** "Control Total de su Negocio, Sin Complicaciones."
- **Subtexto:** Sistema integral de gestión de costos, inventario y ventas diseñado para la MiPyME moderna.
- **CTA Principal:** "Acceso al Sistema" (Abre modal de Login o desplaza a sección).
- **CTA Secundario:** "Explorar Módulos" (Scroll a secciones informativas).

### B. Showcase de Módulos (Grid Informativo)
Breve descripción de los pilares del sistema:
1. **Gestión de Costos:** Motor de cálculo con 14 secciones de gasto.
2. **Punto de Venta (TPV):** Operativa móvil optimizada para zonas de alcance del pulgar.
3. **Logística e Inventario:** Control multi-sucursal con aislamiento RLS.
4. **Inteligencia de Negocio:** Reportes profesionales y asistente Jules AI.

### C. Caso de Uso Protagonista: Generación Masiva de Fichas de Costo
Sección destacada con enfoque narrativo sobre eficiencia operativa.

### D. Footer Corporativo
- Enlaces a soporte, términos y versión del sistema.
- Repetición del CTA de acceso.

## 3. Narrativa del Caso de Uso MiPyME: "La Transformación de los Lunes"

**Escenario Crítico:**
Una MiPyME de distribución recibe semanalmente un promedio de **100 productos nuevos**. Cada lote llega con facturas de costos variables (cambios en materia prima, aranceles, logística).

**El Dolor (Proceso Manual):**
- Crear 100 fichas de costo una a una consume ~15-20 horas hombre.
- Riesgo crítico de errores de transcripción en fórmulas complejas.
- Inviabilidad para ajustar precios de venta rápidamente.

**La Solución CostPro:**
- **Entrada:** Un archivo Excel simple con la relación Producto ↔ Costo Unitario.
- **Acción:** El usuario carga el archivo en el Generador Masivo.
- **Resultado:** En menos de **5 minutos**, el sistema genera las 100 fichas de costo completas, aplicando automáticamente porcentajes de seguridad social, impuestos de fuerza de trabajo y márgenes de utilidad configurados.

**Impacto en el Negocio:**
- Ahorro del 95% en tiempo administrativo.
- Datos 100% precisos para la toma de decisiones.
- Agilidad para reaccionar a cambios de mercado en tiempo real.

## 4. Descripción Funcional de SVGs Animados

### SVG 1: El Flujo de Automatización (Workflow)
- **Visualización:** Un icono de Excel a la izquierda, una "Caja de Procesamiento" (Sistema) en el centro con engranajes o pulsos de luz, y múltiples "Fichas de Costo" emergiendo a la derecha.
- **Mensaje:** Simplicidad y transformación de datos brutos en información estructurada.
- **Dinámica:** Movimiento fluido de partículas desde el Excel hacia el sistema, y una cascada organizada de fichas generadas.

### SVG 2: Velocidad y Escala (Reloj/Cronómetro)
- **Visualización:** Un cronómetro que retrocede o una barra de carga que se completa instantáneamente mientras el contador de "Fichas Generadas" sube rápidamente de 0 a 100.
- **Mensaje:** El tiempo es el recurso más valioso; nosotros lo recuperamos para usted.
- **Dinámica:** Animación de "aceleración" que refuerza la idea de eficiencia masiva frente al método manual.

## 5. Flujo UX de Acceso al Login

1. **Estado Inicial:** El usuario aterriza en `/login` pero ve la Landing Informativa.
2. **Disparador:** El usuario presiona cualquier botón de "Acceso al Sistema".
3. **Transición:**
   - **Opción A (Modal):** Se despliega un modal centrado con el formulario de login existente (Neu-card). El fondo de la landing se desenfoca (backdrop-blur).
   - **Opción B (Switch de Vista):** La landing se desvanece suavemente y el formulario de login aparece mediante una animación de `framer-motion` (opacity & scale).
4. **Persistencia:** Si el usuario ya está autenticado, el sistema lo redirige automáticamente a la Terminal (lógica actual).

## 6. Consideraciones de Diseño y Mantenibilidad

- **Stack:** React, Tailwind CSS, Framer Motion, Lucide Icons.
- **Componentización:**
  - Crear `WelcomeLandingView` como componente principal.
  - El formulario de login actual se extrae a un componente `LoginForm` reutilizable.
- **Diseño Visual:**
  - Mantener el estilo "Neumórfico/Cyber" consistente con el resto del sistema.
  - Uso intensivo de `backdrop-blur` para capas de información.
  - Tipografía clara y jerarquizada (Inter/Black para títulos).
- **Mantenibilidad:** El contenido de los módulos y el caso de uso debe estar definido en un objeto de configuración para facilitar actualizaciones de marketing sin tocar la lógica de renderizado.
