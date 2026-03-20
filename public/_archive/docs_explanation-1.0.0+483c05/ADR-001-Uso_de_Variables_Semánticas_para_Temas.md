# ADR-001: Uso de Variables Semánticas para Temas

**Estado:** Accepted
**Fecha:** 2026-03-12

## Contexto
El sistema soporta múltiples temas (fast-light, fast-dark, neumo). Los colores hardcodeados rompen la consistencia visual.

## Decisión
Se prohíbe el uso de colores hardcodeados (hex, Tailwind colors como bg-white). Se deben usar variables semánticas como bg-background, text-foreground.

## Consecuencias
Mayor facilidad para el mantenimiento de temas y consistencia visual garantizada.
