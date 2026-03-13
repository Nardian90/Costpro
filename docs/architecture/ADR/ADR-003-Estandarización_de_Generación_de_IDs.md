# ADR-003: Estandarización de Generación de IDs

**Estado:** Accepted
**Fecha:** 2026-03-12

## Contexto
El uso del paquete 'uuid' ha causado conflictos de resolución en entornos Next.js/Turbopack.

## Decisión
Se estandariza el uso de crypto.randomUUID() o generadores internos basados en Date.now() y Math.random() para evitar dependencias externas problemáticas.

## Consecuencias
Eliminación de errores de compilación relacionados con ESM/CJS en la generación de IDs.
