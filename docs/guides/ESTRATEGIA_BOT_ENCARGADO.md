# Estrategia Integral: Eli - Inteligencia Integrada CostPro

## 1. Visión General
Propuesta estratégica para implementar a Eli, el asistente virtual interno que empodere al **Encargado de Tienda**. Eli actúa como un analista de datos 24/7, transformando los registros operativos de CostPro en decisiones accionables para optimizar el inventario, reducir mermas y maximizar las ventas.

---

## 2. Arquitectura Técnica y Flujo de Datos

### A. Infraestructura
*   **Base de Datos (Corazón):** Supabase (PostgreSQL). Utilización de las tablas existentes (`products`, `stock_movements`, `transactions`, `inventory_batches`) mediante vistas optimizadas.
*   **Cerebro de IA:** Supabase Edge Functions (Deno) conectadas con modelos de lenguaje avanzado (OpenAI GPT-4o o Claude 3.5 Sonnet).
*   **Capa de Orquestación:** Node.js (Next.js API Routes) para gestionar la lógica de negocio pesada y la integración con servicios de mensajería.
*   **Canales de Interacción:**
    *   **UI Nativa:** Widget de chat flotante en la PWA de CostPro.
    *   **Push:** Integración con Telegram/Slack para notificaciones de "empuje" (proactivas).

### B. Flujo de Información
1.  **Captura:** Cada venta o movimiento de stock dispara un evento.
2.  **Agregación:** Un proceso en segundo plano (pg_cron) resume métricas clave cada hora (ej. productos bajo el mínimo).
3.  **Consulta:** El encargado pregunta: *"¿Qué productos están en riesgo de agotarse?"*
4.  **Procesamiento (NLP):** El LLM interpreta la intención y solicita datos a la base de datos mediante **Function Calling** (ejecución de RPCs seguras).
5.  **Respuesta:** El bot devuelve un análisis en lenguaje natural + un componente visual (ej. una tabla de pedidos sugeridos).

---

## 3. Funcionalidades Detalladas

### I. Gestión Proactiva de Inventario
*   **Alertas de Quiebre de Stock:** Notificación automática inmediata cuando `stock_current < min_stock`.
*   **Monitoreo de Caducidad:** (Propuesta de mejora al esquema) Alerta 30 días antes de la fecha de vencimiento de lotes en `inventory_batches`.
*   **Detección de "Stock Muerto":** Identificación de productos sin movimientos en los últimos 45 días para sugerir promociones.

### II. Reaprovisionamiento Inteligente
*   **Pedido Sugerido:** Basado en el *Runway* (Días de inventario restante = Stock Actual / Venta Diaria Promedio).
*   **Análisis de Proveedores:** Recomendación de a qué proveedor comprar según el historial de costos y tiempos de entrega registrados en `receipts`.

### III. Análisis de Ventas y Tendencias
*   **Resumen Ejecutivo Diario:** Al cierre del día, envío de un reporte: *"Hoy vendiste un 15% más que el martes pasado. La categoría 'Bebidas' impulsó el crecimiento".*
*   **Predicción de Demanda:** Uso de promedios móviles ponderados para anticipar picos de demanda (fines de semana o festivos).

---

## 4. Inteligencia del Bot y NLP
*   **RAG (Retrieval-Augmented Generation):** El bot no solo "habla", sino que consulta el manual de procedimientos interno y el estado actual de la tienda para dar respuestas contextuales.
*   **Insights Accionables:** En lugar de solo dar datos, el bot propone: *"Tienes exceso de Producto X, te sugiero un descuento del 10% para liberar espacio en bodega"*.
*   **Seguridad mediante Tool-Use:** El LLM no escribe SQL directamente; solo puede llamar a funciones predefinidas (RPCs) validadas por el equipo de ingeniería.

---

## 5. Seguridad y Permisos
*   **Cumplimiento de RLS:** El bot hereda el contexto de seguridad del usuario. Si un encargado solo tiene acceso a la "Tienda A", el bot jamás responderá con datos de la "Tienda B".
*   **Logs de Auditoría:** Registro de cada interacción en la tabla `audit_logs`, permitiendo auditar qué recomendaciones se dieron y cuáles fueron seguidas.
*   **Protección de Datos Sensibles:** Filtrado de información de costos de compra según el rol del usuario (ej. un cajero no ve el margen de utilidad, un encargado sí).

---

## 6. Hoja de Ruta (Roadmap)

### Fase 1: MVP (Mínimo Producto Viable) - *Foco: Visibilidad*
*   Chat interno en la app para consultas de stock actual.
*   Alertas de stock crítico vía Telegram.
*   Reporte diario de ventas básicas.

### Fase 2: Expansión - *Foco: Inteligencia*
*   Algoritmo de pedido sugerido.
*   Análisis de productos de baja rotación.
*   Integración con el módulo de compras para generar borradores de órdenes de compra.

### Fase 3: Optimización Avanzada - *Foco: Predicción*
*   Forecast de demanda basado en Machine Learning.
*   Análisis comparativo multi-tienda (para dueños/administradores).
*   Gestión automatizada de transferencias entre tiendas según necesidad de stock.

---

## 7. Métricas de Éxito (KPIs)
1.  **Reducción de Agotados (Out-of-Stock):** Disminución del 25% en incidencias de falta de stock en productos tipo A.
2.  **Eficiencia de Pedido:** Reducción del tiempo administrativo para generar órdenes de compra en un 40%.
3.  **Tasa de Adopción:** Porcentaje de recomendaciones del bot que el encargado convierte en acciones reales.

---

## 8. Probabilidad de Éxito
**Puntaje: 10/10**

**Justificación:**
CostPro cuenta con una base sólida de datos (Kardex, histórico de transacciones, RLS robusto). Como agente Eli, tengo acceso completo para implementar las funciones de base de datos (RPC), configurar las Edge Functions de Supabase y desarrollar la interfaz en React. La integración no requiere cambios estructurales masivos, sino "reforzar los pilares" existentes con una capa de inteligencia conversacional.
