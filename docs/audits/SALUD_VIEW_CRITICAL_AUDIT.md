# Auditoría Hipercrítica: Vista de Salud (Intelligence Hub) v1.0
**Evaluación Inicial: 4/10**

## 1. Análisis de Integridad y Lógica (Deep Dive)
*   **Desconexión de Fuente de Verdad:** El API Route está apuntando a rutas obsoletas (`public/`) mientras que el sistema v9.0 ha migrado a `knowledge/architecture/`. Resultado: **Datos Zombis**.
*   **Parsers Ingenuos:** El parser de YAML es una implementación manual por `split(':')` que fallará ante cualquier estructura anidada o valores con dos puntos.
*   **Puntos de Fallo Único:** La falta de validación de esquemas en el API hace que la UI sea extremadamente frágil ante cambios en la estructura de los JSON de arquitectura.

## 2. Evaluación de Experiencia de Usuario (UX/UI)
*   **Estética de Fachada:** Se abusa de gradientes y sombras "neon" para ocultar la falta de interactividad real.
*   **Placeholders Inaceptables:** La pestaña de Arquitectura y el Grafo Semántico son cajas vacías con texto decorativo. Un sistema de nivel 9+ debe renderizar el grafo de dependencias real usando D3.js o similar.
*   **Jerarquía de Información Deficiente:** El "Overview" desperdicia el 40% de la pantalla en una tarjeta de estado estática ("SISTEMA ESTABLE") en lugar de priorizar métricas de deriva (drift) o alertas de cuarentena.

## 3. Perspectiva de Roles (Admin/CTO/Auditor)
*   **CTO:** No hay visualización de tendencias. ¿La estabilidad mejora o empeora con cada ciclo? No se sabe.
*   **Auditor de Seguridad/Integridad:** La "Cuarentena" es un visor de JSON crudo. Es imposible gestionar incidencias desde ahí.
*   **Desarrollador:** La documentación es estática ("Work in Progress"). No refleja el estado real del sistema Diataxis.

---

# Plan de Elevación (Objetivo: 9.5/10)

## Fase A: Reingeniería del Núcleo (Backend)
1.  **Sincronización v9.0:** Corregir todas las rutas en `src/app/api/intelligence/route.ts`.
2.  **Robustez:** Implementar un parser de YAML real y validación de tipos para los artefactos de conocimiento.
3.  **Agregación:** Calcular métricas de salud en tiempo real (Integrity Score dinámico) basado en el ratio de éxito de las últimas 10 fases.

## Fase B: Visualización Avanzada (Frontend/D3)
1.  **Grafo de Dependencias Vivo:** Sustituir el placeholder por una visualización `force-directed` de D3 que permita explorar las relaciones entre componentes.
2.  **Heatmap de Inestabilidad:** Crear una matriz visual que resalte los archivos con mayor "Instability" según las métricas de arquitectura.
3.  **Trend Analytics:** Añadir micro-gráficos de líneas en los KPIs de la pestaña de Auditoría para mostrar la evolución del tiempo de ejecución y éxito.

## Fase C: Acción e Inteligencia
1.  **Actionable Quarantine:** Transformar el visor de JSON en una tabla de gestión de incidentes con estados (Pending, Ignored, Fixed).
2.  **Living Docs Engine:** Implementar un buscador semántico real sobre los archivos en `knowledge/docs/`.
3.  **Modo "Panic":** Visualización de alta prioridad cuando el `confidenceThreshold` caiga por debajo del 80%.
