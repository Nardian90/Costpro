# Evaluación: Migración del Agent Loop a Vercel AI SDK

**Fecha:** 2026-06-28
**Estado:** Documentado — NO migrar todavía
**Autor:** Auditoría ChatBot

## Contexto

El agent loop actual de `/api/bot/chat` (`src/app/api/bot/chat/route.ts`) implementa:

- Llamada a `callAI()` / `callAIStream()` con fallback GLM → Gemini
- Detección manual de tool calls via parsing de texto (`[TOOL_CALL] {...}` o bloques ````json {...} ````)
- Ejecución de tools en `toolHandlers` registry
- Iteración hasta `MAX_TOOL_ITERATIONS = 3`
- Streaming SSE manual con `ReadableStream`

El problema: **la IA alucina nombres de herramientas** porque el sistema actual NO usa la API nativa de tool-calling de los LLMs — parsea texto. Esto causa bugs como el de `get_cost_summary` (que no existía y la IA lo invocaba de todos modos).

## Opción evaluada: Vercel AI SDK (`ai` package)

### Ventajas

1. **Tool calling nativo** — `streamText({ tools: {...} })` usa la API oficial del provider (GLM-4 soporta function calling) en lugar de parseo de texto.
2. **Streaming multi-step automático** — `maxSteps` reemplaza nuestro `MAX_TOOL_ITERATIONS` manual.
3. **Tipado fuerte** — `tool({ description, parameters: z.object({...}), execute: async (args) => ... })` elimina la categoría entera de bugs de parsing.
4. **Provider-agnostic** — `@ai-sdk/openai-compatible` funciona con GLM, `@ai-sdk/google` con Gemini. Migración trivial entre providers.
5. **Compatible con Edge Runtime** — si en el futuro queremos mover el bot a Edge para menor latencia.
6. **Menos código** — la lógica del agent loop (~150 líneas) se reemplaza por ~30 líneas declarativas.

### Desventajas / Riesgos

1. **GLM no soporta streaming + tools simultáneamente** en todos los modelos. `glm-4-flash` sí, pero `glm-4` y `glm-4-plus` tienen bugs documentados (issues abiertos en bigmodel-sdk).
2. **Costo de migración** — ~8 horas de trabajo: reescribir `route.ts`, `registry.ts`, `definitions.ts`, `provider.ts`. Mantener tests existentes.
3. **Riesgo de regresión** — el flujo actual funciona en producción. Una migración apresurada puede romper el streaming SSE que el frontend (`ChatBot.tsx`) ya sabe parsear.
4. **Vendor lock-in parcial** — el SDK abstrae providers, pero los schemas de tools son específicos del SDK.

## Recomendación

**NO migrar ahora.** Razones:

1. **El bug de alucinación está mitigado** con el fix aplicado hoy (tool `get_cost_summary` real + reglas anti-alucinación en el system prompt). No es un problema urgente.
2. **El código actual pasa los 426 tests** y funciona en producción.
3. **La migración es viable pero no prioritaria** — debería alinearse con un refactor más amplio (p.ej. mover todas las rutas `/api/cost-sheets/ai/chat` y `/api/bot/chat` a un servicio unificado).

### Cuándo SÍ migrar

Cualquiera de estas condiciones:

- Aparecen **3+ bugs de alucinación** más en los próximos 2 meses
- Se necesita **agregar 5+ tools nuevas** (el costo de mantener el parser de texto crece)
- Se requiere **multi-step reasoning complejo** (>3 iteraciones, paralelismo)
- Vercel lanza `ai@5` con mejor soporte GLM

### Plan de migración (cuando se decida)

```ts
// Ejemplo del target final con Vercel AI SDK
import { streamText, tool } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const glm = createOpenAICompatible({
  name: 'glm',
  baseURL: process.env.ZAI_BASE_URL!,
  apiKey: process.env.ZAI_API_KEY!,
});

const result = streamText({
  model: glm('glm-4-flash'),
  system: await buildSystemPrompt({...}),
  messages,
  maxSteps: 5,
  tools: {
    get_cost_summary: tool({
      description: 'Obtiene resumen de costos de la tienda',
      parameters: z.object({ storeId: z.string().optional() }),
      execute: async ({ storeId }) => { /* ... */ },
    }),
    // ... otras tools
  },
});

return result.toDataStreamResponse();
```

## Conclusión

| Métrica | Valor |
|---------|-------|
| Esfuerzo de migración | ~8 horas |
| Riesgo de regresión | Medio |
| Beneficio inmediato | Bajo (bug ya mitigado) |
| Beneficio a largo plazo | Alto (mantenibilidad, tipado, multi-step) |
| **Decisión** | **Postergar** — reevaluar en Q3 2026 |
