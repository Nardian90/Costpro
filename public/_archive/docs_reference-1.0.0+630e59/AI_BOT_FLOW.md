# Flujo del Asistente Inteligente (Jules/Darian)

Este documento detalla la arquitectura, el flujo de datos y las medidas de seguridad del sistema de Inteligencia Artificial en Costpro.

## 1. Arquitectura del Sistema

El sistema utiliza una arquitectura de **Adaptadores y Orquestación** para permitir flexibilidad entre diferentes proveedores de LLM (Gemini, GPT, DeepSeek, etc.), priorizando siempre la disponibilidad y la configuración del usuario.

### Componentes Clave:
- **Orquestador (`orchestrator.ts`):** Determina qué proveedor y qué API Key utilizar basado en una jerarquía de prioridades.
- **Adaptadores (`adapters/`):** Normalizan las peticiones y respuestas para cada proveedor (ej. `GeminiAdapter`).
- **Endpoints de API:**
  - `/api/bot/chat`: Chat general del sistema.
  - `/api/cost-sheets/ai/chat`: Especializado en el análisis y generación de fichas de costo (Darian).

## 2. Jerarquía de Selección de API Keys

Para garantizar que el bot siempre responda, el orquestador busca llaves en el siguiente orden:

1.  **Llave Forzada:** Proporcionada directamente en el cuerpo de la solicitud (UI).
2.  **Llave de Usuario (Base de Datos):** Recuperada de la tabla `ai_api_keys` asociada al ID del usuario actual.
3.  **Fallbacks de Usuario:** Otras llaves activas del mismo usuario para diferentes proveedores.
4.  **Llaves de Sistema:** Llaves globales configuradas en `ai_api_keys` sin `user_id`.
5.  **Variables de Entorno:** Claves configuradas en el servidor (`GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, etc.).
6.  **Llave de Emergencia:** `EMERGENCY_GOOGLE_API_KEY`.

## 3. Seguridad: Normalización de Keys

El sistema implementa una medida de seguridad de "protección por reversión":
- La función `normalizeApiKey` verifica si la llave tiene un prefijo estándar (ej. `AIza`, `sk-`).
- Si no lo tiene, intenta **invertir el string (reverse)** para verificar si así se vuelve válido.
- Esto permite a los usuarios almacenar sus llaves de forma "ofuscada" en la base de datos o configuraciones.

## 4. Lógica de Conversación y Modelo

- **Modelo Predeterminado:** `gemini-2.5-flash`.
- **Manejo de Errores:** El `GeminiAdapter` intercepta errores técnicos de la API de Google y los traduce a mensajes amigables en español:
  - **401/403:** Error de API Key o permisos.
  - **429:** Error de cuota (límite alcanzado).
  - **Safety:** Bloqueo por políticas de contenido.
- **Contexto de Darian:** Para las fichas de costo, se inyecta un `systemPrompt` masivo que incluye regulaciones cubanas (Res. 148/2023) y reglas estrictas de formato JSON para actualizaciones automáticas.

## 5. Tabla de Base de Datos (`ai_api_keys`)

La persistencia se maneja en Supabase con la siguiente estructura:
- `id`: UUID (PK)
- `user_id`: UUID (FK a `auth.users`, NULL para llaves de sistema)
- `provider`: Texto (ej. 'gemini', 'deepseek')
- `api_key`: Texto (La llave, puede estar invertida)
- `is_active`: Booleano
