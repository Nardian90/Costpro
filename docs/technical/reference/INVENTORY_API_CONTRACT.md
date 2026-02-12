
# Contrato de API: Módulo de Inventario

## 1. Introducción

Este documento define el contrato de la API REST para el módulo de inventario de Costpro, asegurando una comunicación clara y eficiente entre el frontend y el backend.

## 2. Endpoints REST

### 2.1. Obtener estado de inventario

Recupera una lista paginada de todos los productos en inventario.

- **Endpoint:** `GET /api/inventory`
- **Query Params:**
  - `page` (opcional, default: 1): Número de página.
  - `pageSize` (opcional, default: 20): Tamaño de la página.
  - `sku` (opcional): Filtro por SKU.
  - `storeId` (opcional): Filtro por tienda.
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "data": [
      {
        "productId": "...",
        "sku": "...",
        "name": "...",
        "quantity": 100,
        "version": 5
      }
    ],
    "pagination": {
      "totalItems": 1,
      "currentPage": 1,
      "pageSize": 20,
      "totalPages": 1
    }
  }
  ```

### 2.2. Ajustar inventario

Endpoint principal para todas las modificaciones de stock (ventas, recepciones, ajustes, etc.).

- **Endpoint:** `POST /api/inventory/adjust`
- **Request Body:**
  ```json
  {
    "productId": "...",
    "quantity": -1,
    "movementType": "SALE", // SALE, RECEIVING, ADJUSTMENT, SHRINKAGE
    "version": 5,
    "storeId": "...", // Requerido
    "reason": "..." // Opcional, para ajustes
  }
  ```
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "productId": "...",
    "newQuantity": 99,
    "newVersion": 6
  }
  ```
- **Respuesta de Error (409 Conflict):**
  ```json
  {
    "error": "Conflict",
    "message": "Inventory version mismatch.",
    "serverVersion": 6,
    "currentQuantity": 105
  }
  ```
- **Respuesta de Error (400 Bad Request):**
  ```json
  {
    "error": "Bad Request",
    "message": "Negative stock is not allowed."
  }
  ```

### 2.3. Obtener historial de movimientos

- **Endpoint:** `GET /api/inventory/{productId}/history`
- **Query Params:**
  - `page` (opcional, default: 1): Número de página.
  - `pageSize` (opcional, default: 20): Tamaño de la página.
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "data": [
      {
        "movementId": "...",
        "timestamp": "...",
        "quantityChange": -1,
        "movementType": "SALE"
      }
    ],
    "pagination": {
      "totalItems": 1,
      "currentPage": 1,
      "pageSize": 20,
      "totalPages": 1
    }
  }
  ```

## 3. Manejo de Optimistic Locking

- El campo `version` es obligatorio para todas las solicitudes de ajuste.
- El frontend debe enviar la `version` que tiene del producto.
- El backend compara esta `version` con la de la base de datos. Si no coinciden, rechaza la solicitud con un HTTP 409.

## 4. Flujo UX ante HTTP 409 Conflict

1. El frontend recibe un 409.
2. Muestra un modal al usuario: "El stock de este producto ha cambiado. La cantidad actual es X. ¿Deseas reintentar la operación con el nuevo stock?"
3. Si el usuario confirma, el frontend reenvía la solicitud `POST /api/inventory/adjust` con la `serverVersion` recibida en la respuesta del 409.

## 5. Reglas de Negocio

- **No Stock Negativo:** El backend no permitirá que una operación deje el stock en negativo.
- **Tipos de Movimiento:**
  - `SALE`: Venta a cliente.
  - `RECEIVING`: Recepción de proveedor.
  - `ADJUSTMENT`: Ajuste manual.
  - `SHRINKAGE`: Merma o pérdida.

## 6. Ejemplo de Flujos

### Venta

1. **GET `/api/inventory`**: El frontend obtiene el stock y la `version` del producto.
2. **POST `/api/inventory/adjust`**: El frontend envía `quantity: -1` y la `version`.
3. El backend valida, actualiza el stock, incrementa la `version` y responde 200 OK.

### Recepción

1. **POST `/api/inventory/adjust`**: Se envía `quantity: 50`, `movementType: 'RECEIVING'` y la `version` actual.
2. El backend procesa la solicitud y actualiza el stock.

## 7. Buenas Prácticas para Móvil

- **Minimizar Datos:** Los endpoints deben devolver solo los datos necesarios.
- **Manejo de Latencia:**
  - El frontend debe mostrar indicadores de carga.
  - Implementar timeouts cortos.
- **Retries:**
  - Usar un mecanismo de "exponential backoff" para reintentos automáticos en errores 5xx.
  - No reintentar automáticamente en errores 4xx (excepto 409, que requiere intervención del usuario).
- **UX Offline:**
  - Guardar operaciones en una cola local si no hay conexión.
  - Sincronizar al recuperar la conexión, manejando posibles conflictos de `version` que puedan surgir.
