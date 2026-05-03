# Task s3-tracing: Add withTracing to ALL remaining API routes

## Work Record

### Initial State
- 33 total API route files under `src/app/api/**/route.ts`
- 6 routes already had withTracing:
  1. `api/bot/chat/route.ts` — POST /api/bot/chat
  2. `api/legal/retention/route.ts` — POST /api/legal/retention
  3. `api/inventory/products/route.ts` — GET /api/inventory/products
  4. `api/reports/generate/route.ts` — POST /api/reports/generate
  5. `api/health/route.ts` — GET /api/health
  6. `api/cost-sheets/save/route.ts` — POST /api/cost-sheets/save

### Changes Made — 27 Files Modified

Each file received:
1. `import { withTracing } from '@/lib/observability';`
2. Handler renamed from `export async function GET/POST(...)` to `async function getHandler/postHandler(...)`
3. Export changed to `export const GET/POST = withTracing(handler, 'METHOD /api/path');`

#### Cost Sheets (6 routes)
| Route | Method | Route Name |
|-------|--------|------------|
| `api/cost-sheets/export-pdf/route.ts` | POST | POST /api/cost-sheets/export-pdf |
| `api/cost-sheets/calculate/route.ts` | POST | POST /api/cost-sheets/calculate |
| `api/cost-sheets/import-json/route.ts` | POST | POST /api/cost-sheets/import-json |
| `api/cost-sheets/import-anexo/route.ts` | POST | POST /api/cost-sheets/import-anexo |
| `api/cost-sheets/ai/chat/route.ts` | POST | POST /api/cost-sheets/ai/chat |

#### Inventory (4 routes)
| Route | Method | Route Name |
|-------|--------|------------|
| `api/inventory/route.ts` | GET | GET /api/inventory |
| `api/inventory/adjust/route.ts` | POST | POST /api/inventory/adjust |
| `api/inventory/adjustments/route.ts` | POST | POST /api/inventory/adjustments |
| `api/inventory/[productId]/history/route.ts` | GET | GET /api/inventory/[productId]/history |

#### Users (4 routes)
| Route | Method | Route Name |
|-------|--------|------------|
| `api/users/managed-create/route.ts` | POST | POST /api/users/managed-create |
| `api/users/reset-password/route.ts` | POST | POST /api/users/reset-password |
| `api/users/toggle-status/route.ts` | POST | POST /api/users/toggle-status |
| `api/users/delete/route.ts` | POST | POST /api/users/delete |

#### Academy (3 routes)
| Route | Method | Route Name |
|-------|--------|------------|
| `api/academy/generate/route.ts` | POST | POST /api/academy/generate |
| `api/academy/review/route.ts` | GET | GET /api/academy/review |
| `api/academy/review/[cardId]/route.ts` | POST | POST /api/academy/review/[cardId] |

#### System/Infrastructure (5 routes)
| Route | Method | Route Name |
|-------|--------|------------|
| `api/docs/route.ts` | GET | GET /api/docs |
| `api/route.ts` | GET | GET /api |
| `api/intelligence/route.ts` | GET | GET /api/intelligence |
| `api/logs/route.ts` | POST | POST /api/logs |
| `api/help-docs/route.ts` | GET | GET /api/help-docs |

#### Other (5 routes)
| Route | Method | Route Name |
|-------|--------|------------|
| `api/legal/incidents/route.ts` | POST | POST /api/legal/incidents |
| `api/pick3/sync/route.ts` | POST | POST /api/pick3/sync |
| `api/rss/route.ts` | GET | GET /api/rss |
| `api/sync/batch/route.ts` | POST | POST /api/sync/batch |
| `api/system-health/knowledge/route.ts` | GET | GET /api/system-health/knowledge |
| `api/system-health/route.ts` | GET | GET /api/system-health |

### Special Cases Handled
- **`help-docs/route.ts`**: Changed `request: Request` to `request: NextRequest`
- **`api/route.ts`** and **`docs/route.ts`**: Added `_request: NextRequest` parameter (handlers didn't use request)
- **`academy/review/[cardId]/route.ts`**: Preserved context parameter `{ params }: { params: Promise<{ cardId: string }> }`
- **`inventory/[productId]/history/route.ts`**: Preserved context parameter `{ params }: { params: Promise<{ productId: string }> }`
- **Handler delegation pattern** (14 files): Wrapped the thin export function that delegates to `withAuth`/`withRole` handler

### Verification
- ESLint: zero errors
- Total withTracing count: 33/33 (100%)
- No handler logic modified
