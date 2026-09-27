# FASE F1 — 02 ADVISORIES BEFORE (PRE-F1)

**Fecha**: 2026-09-27 · **Fuente**: `npm audit --json` ejecutado en HEAD 1272a32f (GET-only, advisory DB live, sin fix). Crudo: `scripts/audit-pre-f1.json` (fuera del repo).

## Totales

```text
metadata.vulnerabilities = { info:0, low:0, moderate:3, high:3, critical:1, total:7 }
```

## Inventario de advisories

| # | Paquete | Versión instalada | Rango vulnerable | Severidad | Advisory | Directa/Transitiva | fixAvailable |
|---|---|---|---|---|---|---|---|
| 1 | next | 16.3.0 | >=16.0.0 <16.3.3 | **CRITICAL** | GHSA-p293-qw3h-jr36 (RCE no autenticado, servidores **Windows-hosted**) | directa | true (no-major) |
| 2 | next | 16.3.0 | >=16.0.0 <16.3.3 | **CRITICAL** | GHSA-2xp9-vwfh-vxw4 (RCE no autenticado, **Image Optimization**/AVIF-libheif) | directa | true (no-major) |
| 3 | sharp | 0.35.3 | <0.35.4 | HIGH | GHSA-rgj7-g3m4-5g8c (libheif; F0 además referenció g89c-p67h-r497, 2jg2-4ch7-h545) | directa | true (no-major) |
| 4 | js-yaml | 4.3.1 | >=4.0.0 <4.3.2 | HIGH | GHSA-2883-xcg3-v3hh (CPU DoS, `maxTotalMergeKeys`) | directa | true (no-major) |
| 5 | @mdxeditor/editor | 4.2.0 | <=4.2.4 | HIGH | (propagación: `via: ["js-yaml"]`, `effects: []` — vulnerable SOLO por su js-yaml interno) | directa | true (no-major) |
| 6 | csv-parse | 7.0.1 | <7.0.2 | MODERATE | GHSA-8cw4-87c7-c6xx (prototype replacement vía `columns`) | directa | true (no-major) |
| 7 | vitest | 4.1.10 | >=2.1.0 <4.1.11 | MODERATE | GHSA-82fw-gwwq-j7x9 (path traversal / arbitrary file read vía `@vitest/mocker`) | directa (dev) | true (no-major) |
| 7b | @vitest/mocker | 4.1.10 | >=2.1.0 <4.1.11 | MODERATE | GHSA-82fw-gwwq-j7x9 (misma advisory, instancia transitiva de vitest) | transitiva | true (no-major) |

## Verificación de exposiciones (FASE 3 del mandato)

### Next.js — runtimes determinados

| Runtime | Motor | Exposición GHSA-p293 (Windows) | Exposición GHSA-2xp9 (Image Optimization) |
|---|---|---|---|
| Producción | Vercel (Linux) | **NO APLICABLE** (no Windows) | **CONDICIONADA** — `next.config.ts` líneas 61-73: `images.remotePatterns` = `https://*.supabase.co/storage/v1/object/public/**` + `*.googleusercontent.com`; componentes con `next/image`: ProductImage.tsx, StoreCard.tsx, StoresManagementView.tsx, SC204Preview.tsx, CostSheetExportModal.tsx, atomic/index.tsx, proxy.ts (9+ archivos). Contenido del bucket público pasa por el optimizer → superficie real si hay uploads de usuario al bucket público |
| pm2 local (server.ts) | Bun + Linux | NO APLICABLE | CONDICIONADA (mismo optimizer) |
| CI | ubuntu-latest | NO APLICABLE | build-time solamente |
| Desarrollo | Linux local | NO APLICABLE | CONDICIONADA |

No se ejecutó explotación real (mandato §14): validación documental/estructural.

### sharp/libheif

CostPro NO procesa AVIF/HEIC de usuarios: los formatos remotos habilitados son los del storage público de Supabase (jpg/png/webp típicos) y Next 16 sirve default WebP. sharp 0.35.3 igualmente queda en el pipeline del optimizer (y en `ofertas/export-pdf` según F0) → remediable patch 0.35.4, sin análisis de payloads.

### js-yaml

Uso real en `src/`: **1 archivo** (`src/app/api/system-health/knowledge/route.ts`) y es **empty-state** (comentario línea 27: "YAML parsing requires js-yaml library. Currently returns empty state"). Uso indirecto: `@mdxeditor/editor` (editor MDX, contexto autenticado). Input de usuario NO llega a js-yaml directamente.

### csv-parse

Uso real: **1 archivo** — `src/app/api/whatsapp/invitations/import/route.ts` línea 10 `import { parse } from 'csv-parse/sync'` con `columns:true`. CSV subido por usuario autenticado → superficie REAL de la advisory (prototype replacement vía `columns`).

### vitest

**Dev-only** (devDependency; test runner local/CI). Cero exposición runtime de producción. Clasificado estrictamente como tooling — no se mezcla con exposición runtime.

## Conclusión PRE-F1

7 vulnerabilidades (6 paquetes raíz + 1 instancia transitiva), todas patch non-breaking (`fixAvailable.isSemVerMajor=false` implícito en `fixAvailable: true` boolean), preexistentes por drift del advisory DB (F0: `git diff 6022ae85..HEAD -- package.json package-lock.json bun.lock` = vacío).
