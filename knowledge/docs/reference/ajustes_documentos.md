# Ajustes de Documentos (Inversión y Duplicación)

Este módulo permite gestionar la anulación de operaciones de ventas y recepciones mediante un proceso de inversión automática que ajusta el inventario de forma segura y coherente.

## Funcionalidades Principales

### 1. Inversión de Documentos
- **Ventas:** Al invertir una venta, el estado del documento cambia a **ANULADO**. El sistema realiza un ajuste de inventario sumando automáticamente las unidades que fueron vendidas de vuelta al stock.
- **Recepciones:** Al invertir una recepción, el estado cambia a **ANULADO**. El sistema realiza un ajuste de inventario restando las unidades recibidas, revirtiendo el incremento de stock inicial.

### 2. Duplicación de Documentos
- Permite cargar rápidamente los items de una venta previa en el carrito del POS para agilizar nuevas operaciones similares.

## Acceso a la Vista de Ajustes

Para visualizar únicamente los ajustes resultantes de estas inversiones:
1. Diríjase al menú lateral izquierdo.
2. Localice la categoría **INVENTARIO**.
3. Haga clic en la opción **AJUSTES DOC.** (identificada con el icono de actualización/flechas circulares).

En esta vista podrá ver:
- El tipo de ajuste (Aumento por venta invertida o Disminución por recepción invertida).
- El producto afectado y la cantidad.
- La referencia al documento original que motivó el ajuste.
- La fecha y hora de la operación.

## Identificación de Documentos Anulados

En las vistas de **Ventas** e **Historial de Recepciones**, los documentos que han pasado por este proceso aparecerán marcados claramente con el estado **ANULADO** en color rojo, permitiendo una fácil auditoría de las operaciones invalidadas.

---
*Nota: El sistema utiliza el costo unitario original de la recepción para asegurar que la valoración del inventario (CPP) se mantenga precisa durante la inversión.*
