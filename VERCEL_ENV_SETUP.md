# Configuración de Variables de Entorno — Vercel

Vercel NO lee .env.local en producción.
Ir a: Vercel Dashboard → CostPro → Settings → Environment Variables

## Variables del Chat AI (Proveedor primario — GLM/Z.ai)
| Variable | Valor | Scope |
|---|---|---|
| GLM_API_KEY | [clave de Z.ai] | Production, Preview, Development |
| GLM_MODEL | glm-4-flash | Production, Preview, Development |

## Variables del Chat AI (Fallback — Gemini directo)
| Variable | Valor | Scope |
|---|---|---|
| GOOGLE_API_KEY | [clave de Google AI Studio] | Production, Preview, Development |
| GEMINI_MODEL | gemini-1.5-flash | Production, Preview, Development |

## Comportamiento del sistema
- Si GLM_API_KEY está configurada → usa GLM como proveedor principal
- Si GLM falla o la clave no está → cae automáticamente a Gemini
- Si ambos fallan → el chat muestra un error descriptivo con la causa exacta

## Cómo obtener las claves
- GLM/Z.ai: https://open.bigmodel.cn/ → API Keys
- Google Gemini: https://aistudio.google.com/app/apikey

## Después de configurar las variables
1. Vercel Dashboard → Deployments → Redeploy (sin cache)
2. Probar el chat en producción
3. Si falla: Deployments → [último] → Functions → ver logs en tiempo real
