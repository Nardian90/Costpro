# ADR-002: Seguridad de API Keys de AI

**Estado:** Accepted
**Fecha:** 2026-03-12

## Contexto
El sistema utiliza múltiples proveedores de AI (Gemini, GPT, DeepSeek).

## Decisión
Las llaves de API nunca deben estar en el código. Se deben obtener de variables de entorno o de la base de datos (Supabase ai_api_keys).

## Consecuencias
Mejora la seguridad y permite la rotación de llaves sin desplegar nuevo código.
