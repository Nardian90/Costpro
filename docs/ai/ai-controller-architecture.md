# Arquitectura del Controlador IA — Darian

**Versión:** 5.7.x | Sistema de Asistente Inteligente Multi-Proveedor

---

## Tabla de Contenidos

- [Visión General](#visión-general)
- [Diagrama de Flujo Completo](#diagrama-de-flujo-completo)
- [Componentes del Sistema](#componentes-del-sistema)
- [Sistema de Prompts](#sistema-de-prompts)
- [Herramientas Disponibles](#herramientas-disponibles)
- [Orquestador Multi-Proveedor](#orquestador-multi-proveedor)
- [Loop de Herramientas](#loop-de-herramientas)
- [Seguridad y Control de Acceso](#seguridad-y-control-de-acceso)
- [Auditoría e Idempotencia](#auditoría-e-idempotencia)
- [Guía de Extensión](#guía-de-extensión)

---

## Visión General

**Darian** es el asistente inteligente integrado en CostPro. Actúa como interfaz entre el lenguaje natural del usuario y las operaciones del sistema. Puede navegar entre vistas, rellenar formularios, buscar datos, exportar documentos y ejecutar acciones del sistema — todo mediante instrucciones en lenguaje natural.

**Características clave:**
- Soporte de **5 proveedores LLM** con fallback automático
- **9 herramientas** de acción sobre el sistema
- Claves API **por usuario** (no centralizadas)
- **RBAC** integrado: cada herramienta verifica permisos antes de ejecutar
- **Auditoría completa** en `audit_logs`
- Loop de herramientas con máximo **5 iteraciones**
- Integración con **base de conocimiento** (resoluciones legales cubanas)

---

## Diagrama de Flujo Completo

```
Usuario escribe mensaje en ChatBot.tsx
          │
          ▼
POST /api/bot/chat
          │
          ▼
┌─────────────────────────────────────┐
│           bot-service.ts            │
│                                     │
│  1. Construye system prompt:        │
│     - Identidad de Darian           │
│     - store_id actual               │
│     - rol del usuario               │
│     - registro de vistas            │
│     - base de conocimiento          │
│     - herramientas disponibles      │
│                                     │
│  2. Añade historial de conversación │
│                                     │
│  3. Aplica throttling RPM           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│          orchestrator.ts            │
│                                     │
│  Selecciona proveedor:              │
│  1. Busca clave activa en           │
│     ai_api_keys (Supabase)          │
│  2. Ordena por preferencia usuario  │
│  3. Crea FallbackAdapter:           │
│     Gemini → GPT → Qwen →           │
│     DeepSeek → Kimi                 │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         LLMAdapter.chat()           │
│  (Gemini | GPT | Qwen | ...)        │
│                                     │
│  Envía: messages + tools JSON       │
│  Recibe: text | tool_call           │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼ text                ▼ tool_call
    │           ┌─────────────────────────┐
    │           │      tool-registry.ts   │
    │           │                         │
    │           │  1. Verifica permisos   │
    │           │     hasRole(user, role) │
    │           │                         │
    │           │  2. Valida parámetros   │
    │           │     Zod schema          │
    │           │                         │
    │           │  3. Ejecuta acción:     │
    │           │     - Supabase RPC      │
    │           │     - UI navigation     │
    │           │     - File generation   │
    │           │                         │
    │           │  4. Registra en         │
    │           │     audit_logs          │
    │           └──────────┬──────────────┘
    │                      │
    │           ┌──────────▼──────────────┐
    │           │  ¿Más iteraciones?       │
    │           │  (max: 5)               │
    │           │                         │
    │           │  Sí → volver al LLM     │
    │           │  No → retornar texto    │
    │           └─────────────────────────┘
    │
    ▼
Respuesta final al usuario (ChatBot.tsx)
```

---

## Componentes del Sistema

### `src/services/bot-service.ts`

Orquestador principal de la conversación.

**Responsabilidades:**
- Construir el system prompt con contexto dinámico
- Gestionar el historial de conversación
- Ejecutar el loop de herramientas (máx. 5 iteraciones)
- Implementar retry con backoff exponencial
- Throttling de requests por minuto (RPM)
- Registrar interacciones en `audit_logs`

**Métodos clave:**

```typescript
processMessage(
  message: string,
  conversationHistory: Message[],
  context: { storeId: string; userRole: UserRole; userId: string }
): Promise<BotResponse>

buildSystemPrompt(context: BotContext): string
executeToolLoop(toolCall: ToolCall, user: User): Promise<ToolResult>
```

---

### `src/lib/ai/orchestrator.ts`

Selección de proveedor LLM.

**Responsabilidades:**
- Consultar `ai_api_keys` en Supabase para obtener claves del usuario
- Ordenar proveedores según preferencia configurada
- Crear cadena `FallbackAdapter` con los proveedores disponibles
- Manejar fallos de proveedor transparentemente

---

### `src/lib/ai/adapters/`

Implementaciones de `LLMProvider`:

| Archivo | Proveedor | Modelo por defecto |
|---------|-----------|-------------------|
| `geminiAdapter.ts` | Google Gemini | `gemini-2.0-flash` |
| `gptAdapter.ts` | OpenAI GPT | `gpt-4o` |
| `qwenAdapter.ts` | Alibaba Qwen | `qwen-turbo` |
| `deepseekAdapter.ts` | DeepSeek | `deepseek-chat` |
| `kimiAdapter.ts` | Moonshot Kimi | `moonshot-v1-8k` |
| `fallbackAdapter.ts` | Cadena de fallback | — |

**Interfaz `LLMProvider`:**

```typescript
interface LLMProvider {
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse>;

  supportsTools(): boolean;
  getProviderName(): string;
}
```

---

### `src/lib/ai/tools/definitions.ts`

Definiciones JSON de herramientas para el LLM (formato OpenAI function calling).

### `src/lib/ai/tools/registry.ts`

Ejecutor de herramientas. Contiene la lógica de negocio de cada herramienta, validación de permisos y comunicación con Supabase.

---

## Sistema de Prompts

El system prompt se construye dinámicamente con:

```
1. IDENTIDAD
   "Eres Darian, el asistente inteligente de CostPro..."
   Tono: práctico, conciso, sin jerga técnica innecesaria

2. CONTEXTO DE SESIÓN
   - Tienda activa: {store_name} (ID: {store_id})
   - Rol del usuario: {role}
   - Vista actual: {current_view}

3. REGISTRO DE VISTAS
   - Lista de todas las 25 vistas disponibles con descripción
   - Acciones disponibles por vista

4. BASE DE CONOCIMIENTO
   - Extractos de resoluciones legales cubanas relevantes
   - Normativas de precios y contabilidad

5. HERRAMIENTAS
   - Descripción de las 9 herramientas disponibles
   - Instrucción: "Usa herramientas solo cuando sea necesario"

6. REGLAS DE RESPUESTA
   - Respuestas < 5 segundos de lectura
   - Lenguaje comprensible sin formación contable avanzada
   - Usar emojis y listas para mejor legibilidad en móvil
```

---

## Herramientas Disponibles

### `open_view`
Navega a una vista del sistema.

```json
{
  "viewId": "inventory",
  "params": { "productId": "uuid" }
}
```

**Rol mínimo:** Todos los roles autenticados

---

### `explain_view`
Explica el propósito de una vista y sus acciones disponibles.

```json
{
  "viewId": "cost-sheets"
}
```

**Rol mínimo:** Todos los roles autenticados

---

### `fill_form`
Rellena un formulario sin enviarlo (el usuario confirma antes de guardar).

```json
{
  "formName": "costSheet",
  "data": {
    "name": "Ficha de Pan Artesanal",
    "productName": "Pan de trigo 500g"
  }
}
```

**Rol mínimo:** Todos los roles autenticados

---

### `submit_form`
Rellena y envía un formulario directamente.

```json
{
  "formName": "product",
  "data": {
    "name": "Harina de trigo",
    "sku": "HRN-001",
    "salePrice": 45.00,
    "unit": "kg"
  }
}
```

**Rol mínimo:** `encargado`, `admin`

---

### `search_entity`
Busca registros en la base de datos.

```json
{
  "entity": "product",
  "query": "harina",
  "filters": { "category": "materias_primas", "isActive": true }
}
```

**Entidades soportadas:** `product`, `costSheet`, `transaction`, `supply`

**Rol mínimo:** Todos los roles autenticados

---

### `execute_action`
Ejecuta una acción del sistema.

```json
{
  "actionName": "recalculate_costs",
  "parameters": { "costSheetId": "uuid" }
}
```

**Acciones disponibles:** `recalculate_costs`, `sync_data`, `clear_cache`

**Rol mínimo:** `encargado`, `admin`

---

### `export_document`
Genera y descarga un documento.

```json
{
  "type": "pdf",
  "entityType": "costSheet",
  "entityId": "uuid"
}
```

**Formatos:** `pdf`, `excel`

**Rol mínimo:** `encargado`, `admin`

---

### `set_ui_mode`
Cambia el modo de la interfaz.

```json
{
  "mode": "expert"
}
```

**Modos:** `standard`, `expert`

**Rol mínimo:** `admin`, `encargado`, `costo`

---

### `run_system_health_check`
Ejecuta una auditoría completa del sistema.

```json
{
  "viewIds": ["pos", "inventory", "cost-sheets"]
}
```

Si `viewIds` se omite, revisa todas las vistas.

**Rol mínimo:** `admin`, `encargado`

---

## Orquestador Multi-Proveedor

### Selección de Proveedor

```
1. Consulta ai_api_keys WHERE user_id = current_user AND is_active = true
2. Ordena: proveedor preferido del usuario primero
3. Construye FallbackAdapter([adapter1, adapter2, ...])
4. En caso de error de un proveedor:
   - Error 401/403 → API key inválida → marca is_active = false
   - Error 429 → rate limit → reintenta con backoff
   - Error 5xx → falla del proveedor → pasa al siguiente
```

### Configuración del Usuario

Los usuarios configuran sus claves desde **Ajustes > IA**. El sistema guarda en `ai_api_keys`:

```sql
INSERT INTO ai_api_keys (user_id, provider, api_key, is_active)
VALUES ($1, $2, $3, true)
ON CONFLICT (user_id, provider) DO UPDATE SET api_key = $3, is_active = true;
```

---

## Loop de Herramientas

```
Iteración 1: LLM recibe mensaje + contexto
     │
     ▼
LLM decide: ¿texto o tool_call?
     │
     ├── texto → FIN (respuesta directa)
     │
     └── tool_call
              │
              ▼
         tool-registry ejecuta
              │
              ▼
         Resultado → añadir al historial
              │
              ▼
         Iteración 2: LLM recibe resultado + continúa
              │
              ... (máx. 5 iteraciones)
              │
              ▼
         Iteración 5: forzar respuesta de texto
```

**¿Por qué máximo 5 iteraciones?**
Previene loops infinitos de herramientas y controla el costo de tokens de API.

---

## Seguridad y Control de Acceso

### Verificación de Permisos en Herramientas

```typescript
// Antes de ejecutar cualquier herramienta
const tool = TOOLS.find(t => t.name === toolCall.name);

if (!tool.allowedRoles.includes(userRole)) {
  return {
    error: 'PERMISSION_DENIED',
    message: `Tu rol (${userRole}) no puede ejecutar esta acción.`
  };
}
```

### Validación de Parámetros

Todos los parámetros de herramientas se validan con Zod:

```typescript
const paramSchema = z.object({
  viewId: z.string().min(1),
  params: z.record(z.unknown()).optional()
});

const validated = paramSchema.safeParse(toolCall.parameters);
if (!validated.success) {
  return { error: 'INVALID_PARAMETERS', details: validated.error };
}
```

### RLS en Herramientas que Acceden a Datos

Las herramientas que consultan Supabase usan el cliente autenticado del usuario, garantizando que RLS filtre automáticamente datos de otras tiendas.

---

## Auditoría e Idempotencia

Cada ejecución de herramienta genera una entrada en `audit_logs`:

```typescript
await supabase.from('audit_logs').insert({
  store_id: context.storeId,
  user_id: context.userId,
  action: `ai_tool_${toolCall.name}`,
  entity_type: 'ai_interaction',
  details: {
    tool: toolCall.name,
    parameters: toolCall.parameters,
    result: toolResult,
    provider: usedProvider
  }
});
```

---

## Guía de Extensión

### Añadir una Nueva Herramienta

**Paso 1:** Definir en `src/lib/ai/tools/definitions.ts`:

```typescript
{
  name: "mi_nueva_herramienta",
  allowedRoles: ['admin', 'encargado'],
  description: "Descripción clara en español para que el LLM sepa cuándo usarla.",
  parameters: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "Descripción del parámetro."
      }
    },
    required: ["param1"]
  }
}
```

**Paso 2:** Implementar en `src/lib/ai/tools/registry.ts`:

```typescript
case 'mi_nueva_herramienta': {
  // Validar parámetros
  const { param1 } = validated.data;

  // Ejecutar lógica de negocio
  const { data, error } = await supabase.rpc('mi_funcion', { param1 });

  if (error) return { error: error.message };

  // Registrar en audit_logs
  await logToolExecution('mi_nueva_herramienta', { param1 }, data, context);

  return { success: true, data };
}
```

**Paso 3:** Añadir test en `src/lib/ai/tools/registry.test.ts`.

### Añadir un Nuevo Proveedor LLM

**Paso 1:** Crear `src/lib/ai/adapters/nuevoAdapter.ts` implementando `LLMProvider`.

**Paso 2:** Registrar en `orchestrator.ts`:

```typescript
const PROVIDERS: Record<string, () => LLMProvider> = {
  gemini: () => new GeminiAdapter(apiKey),
  gpt: () => new GPTAdapter(apiKey),
  nuevo: () => new NuevoAdapter(apiKey),  // ← aquí
};
```

**Paso 3:** Añadir opción en el formulario de Ajustes > IA.

**Paso 4:** Actualizar el schema de `ai_api_keys` si el enum de proveedores está restringido.
