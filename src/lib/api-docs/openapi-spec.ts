/**
 * openapi-spec.ts — Full OpenAPI 3.0.3 specification for CostPro Enterprise API.
 *
 * Covers all 30 API routes grouped by tag:
 *   System (3), AI (2), CostSheets (6), Academy (3), Inventory (5),
 *   Reports (1), Users (4), Sync (1), Sales (1), Other (4)
 *
 * Rate limits:
 *   Standard: 30 req/min (windowMs: 60000)
 *   AI routes: 10 req/min
 *   Cost engine: 60 req/min
 */
import { zodToOpenApi } from './zod-to-openapi';
import {
  managedCreateUserSchema,
  toggleUserStatusSchema,
  deleteUserSchema,
  resetPasswordSchema,
  inventoryAdjustSchema,
  inventoryAdjustmentsSchema,
  costSheetSaveSchema,
  aiChatSchema,
  reportsGenerateSchema,
  academyGenerateSchema,
  academyReviewSchema,
  logsSchema,
  botChatSchema,
} from '@/validation/api-schemas';

// ─── Shared components ─────────────────────────────────────────────────────────

const errorResponse400 = {
  description: 'Bad Request — Validation error or invalid input',
  content: {
    'application/json': {
      schema: {
        oneOf: [
          { $ref: '#/components/schemas/ValidationError' },
          { $ref: '#/components/schemas/ErrorResponse' },
        ],
      },
    },
  },
};

const errorResponse401 = {
  description: 'Unauthorized — Missing or invalid authentication',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const errorResponse403 = {
  description: 'Forbidden — Insufficient permissions',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const errorResponse404 = {
  description: 'Not Found',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const errorResponse409 = {
  description: 'Conflict — Version mismatch or duplicate',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const errorResponse429 = {
  description: 'Too Many Requests — Rate limit exceeded',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const errorResponse500 = {
  description: 'Internal Server Error',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const errorResponse502 = {
  description: 'Bad Gateway — Upstream AI service error',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

// ─── Tags ───────────────────────────────────────────────────────────────────────

const tags = [
  { name: 'System', description: 'Health checks, help docs, and system diagnostics' },
  { name: 'AI', description: 'AI-powered chat and Darian cost sheet assistant' },
  { name: 'CostSheets', description: 'Cost sheet calculation, import/export, and persistence' },
  { name: 'Academy', description: 'AI-generated learning cards and spaced repetition' },
  { name: 'Inventory', description: 'Product inventory management and stock adjustments' },
  { name: 'Reports', description: 'PDF report generation for business data' },
  { name: 'Users', description: 'User management (admin only)' },
  { name: 'Sync', description: 'Batch data synchronization with idempotency' },
  { name: 'Other', description: 'Logging, RSS feeds, Pick3, and intelligence data' },
];

// ─── Build specification ────────────────────────────────────────────────────────

export function createOpenAPISpec() {
  const spec: Record<string, unknown> = {
    openapi: '3.0.3',
    info: {
      title: 'CostPro Enterprise API',
      version: '1.0.0',
      description: `Comprehensive REST API for the CostPro Enterprise cost management platform.

**Rate Limits:**
- **Standard endpoints:** 30 requests/minute
- **AI endpoints** (bot/chat, cost-sheets/ai/chat, academy/generate): 10 requests/minute
- **Cost Engine** (cost-sheets/calculate): 60 requests/minute

**Authentication:**
Most endpoints require a valid session (cookie or Bearer JWT token).
User management endpoints require \`admin\` or \`encargado\` role.

**Response Format:**
All JSON responses use a consistent format:
- Success: \`{ ok: true, ...data }\` or \`{ success: true, ...data }\`
- Error: \`{ error: "message" }\` or \`{ ok: false, error: "message", details: [...] }\``,
      contact: {
        name: 'CostPro Enterprise Support',
        email: 'support@costpro.app',
      },
      license: {
        name: 'Proprietary',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Current server (gateway proxied)',
      },
    ],
    tags,
    paths: {},

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from NextAuth session',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'next-auth.session-token',
          description: 'NextAuth session cookie',
        },
        cronAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'CRON_SECRET for scheduled jobs (e.g., Pick3 sync)',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Human-readable error message' },
            message: { type: 'string', description: 'Additional detail (optional)' },
            details: { type: 'string', description: 'Technical details (optional)' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', const: false },
            error: { type: 'string', example: 'Validation failed' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'Email inválido' },
                },
              },
            },
          },
        },
        RateLimitHeaders: {
          type: 'object',
          properties: {
            'X-RateLimit-Remaining': { type: 'string' },
            'X-RateLimit-Reset': { type: 'string', format: 'date-time' },
            'Retry-After': { type: 'string' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            totalItems: { type: 'integer' },
            currentPage: { type: 'integer' },
            pageSize: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },

        // ─── User schemas ────────────────────────────────────────────
        ManagedCreateUserRequest: zodToOpenApi(managedCreateUserSchema),
        ToggleUserStatusRequest: zodToOpenApi(toggleUserStatusSchema),
        DeleteUserRequest: zodToOpenApi(deleteUserSchema),
        ResetPasswordRequest: zodToOpenApi(resetPasswordSchema),

        // ─── Inventory schemas ───────────────────────────────────────
        InventoryAdjustRequest: zodToOpenApi(inventoryAdjustSchema),
        InventoryAdjustmentsRequest: zodToOpenApi(inventoryAdjustmentsSchema),
        InventoryItem: {
          type: 'object',
          properties: {
            productId: { type: 'string', format: 'uuid' },
            sku: { type: 'string' },
            name: { type: 'string' },
            quantity: { type: 'number' },
            version: { type: 'integer' },
          },
        },
        InventoryMovement: {
          type: 'object',
          properties: {
            movementId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            quantityChange: { type: 'number' },
            movementType: { type: 'string', enum: ['sale', 'reception', 'adjustment', 'transfer'] },
          },
        },
        AdjustInventoryResponse: {
          type: 'object',
          properties: {
            productId: { type: 'string', format: 'uuid' },
            newQuantity: { type: 'number' },
            newVersion: { type: 'integer' },
          },
        },

        // ─── Cost Sheet schemas ──────────────────────────────────────
        CostSheetSaveRequest: zodToOpenApi(costSheetSaveSchema),
        AIChatRequest: zodToOpenApi(aiChatSchema),

        // ─── Academy schemas ─────────────────────────────────────────
        AcademyGenerateRequest: zodToOpenApi(academyGenerateSchema),
        AcademyReviewRequest: zodToOpenApi(academyReviewSchema),

        // ─── Report schemas ──────────────────────────────────────────
        ReportsGenerateRequest: zodToOpenApi(reportsGenerateSchema),

        // ─── Log schemas ─────────────────────────────────────────────
        LogEntry: zodToOpenApi(logsSchema),

        // ─── Bot chat schemas ────────────────────────────────────────
        BotChatRequest: zodToOpenApi(botChatSchema),
      },
    },
  };

  const paths = spec.paths as Record<string, Record<string, unknown>>;

  // ═══════════════════════════════════════════════════════════════════════════════
  // SYSTEM (3 endpoints)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 1. GET /api
  paths['/api'] = {
    get: {
      tags: ['System'],
      operationId: 'rootHello',
      summary: 'Root endpoint',
      description: 'Returns a hello message. Rate limited to 30 req/min for anonymous users.',
      security: [],
      responses: {
        '200': {
          description: 'Hello message',
          content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Hello, world!' } } } } },
        },
        '429': errorResponse429,
      },
    },
  };

  // 2. GET /api/health
  paths['/api/health'] = {
    get: {
      tags: ['System'],
      operationId: 'healthCheck',
      summary: 'Health check',
      description: 'Returns service health status including uptime, version, and response time. No authentication required.',
      security: [],
      responses: {
        '200': {
          description: 'Service health',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  service: { type: 'string', example: 'costpro-enterprise' },
                  timestamp: { type: 'string', format: 'date-time' },
                  version: { type: 'string', example: '1.0.0' },
                  uptime: { type: 'number', description: 'Seconds since startup' },
                  responseTime: { type: 'number', description: 'Response time in ms' },
                },
              },
            },
          },
        },
      },
    },
  };

  // 3. GET /api/help-docs
  paths['/api/help-docs'] = {
    get: {
      tags: ['System'],
      operationId: 'getHelpDocs',
      summary: 'Browse and search help documentation',
      description: `Returns the help documentation structure. Three modes:
- **No params**: Returns the full directory listing (ISO manual, tutorials, how-to, reference, explanation)
- **search=<query>**: Searches markdown files and returns matching results (min 3 chars)
- **path=<relative>**: Returns the content of a specific markdown or JSON file`,
      security: [],
      parameters: [
        { name: 'search', in: 'query', description: 'Search query (minimum 3 characters)', required: false, schema: { type: 'string', minLength: 3 } },
        { name: 'path', in: 'query', description: 'Relative path to a specific file in the knowledge base', required: false, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Documentation structure or file content or search results',
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { type: 'object', description: 'Directory listing', properties: { iso_manual: { type: 'array', items: { type: 'object', properties: { filename: { type: 'string' }, title: { type: 'string' } } } }, docs: { type: 'object' }, user_help: { type: 'object' } } },
                  { type: 'object', description: 'Search results', properties: { results: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, title: { type: 'string' }, excerpt: { type: 'string' }, type: { type: 'string' } } } } } },
                  { type: 'object', description: 'File content', properties: { content: { type: 'string' } } },
                ],
              },
            },
          },
        },
        '403': { description: 'Unauthorized path (path traversal attempt)' },
        '404': { description: 'File not found' },
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // AI (2 endpoints)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 4. POST /api/bot/chat
  paths['/api/bot/chat'] = {
    post: {
      tags: ['AI'],
      operationId: 'botChat',
      summary: 'Chat with AI bot',
      description: 'Send a message to the AI bot and receive a response. Supports conversation history. Rate limited to 10 req/min.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BotChatRequest' },
            example: {
              messages: [{ role: 'user', content: '¿Cómo creo una ficha de costo?' }],
              aiProvider: 'gemini',
              storeId: '550e8400-e29b-41d4-a716-446655440000',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'AI bot response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'AI response text' },
                  metadata: {
                    type: 'object',
                    properties: {
                      provider: { type: 'string', description: 'AI provider used' },
                    },
                  },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
        '502': errorResponse502,
      },
    },
  };

  // 5. POST /api/cost-sheets/ai/chat
  paths['/api/cost-sheets/ai/chat'] = {
    post: {
      tags: ['AI', 'CostSheets'],
      operationId: 'aiCostSheetChat',
      summary: 'Chat with Darian AI (Cost Sheet Assistant)',
      description: `AI-powered cost sheet assistant called "Darian". Generates professional cost sheet proposals following Cuban regulations (Res. 148/2023).
Returns JSON annex update blocks that can be applied to the cost sheet editor.

**Rate limit:** 10 req/min
**Provider whitelist:** openai, anthropic, google, claude, gpt, gemini`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AIChatRequest' },
            example: {
              messages: [{ role: 'user', content: 'Genera una ficha de costo para producción de zapatos' }],
              sheetData: { header: { name: 'Zapatos Deportivos', code: 'FC-001' }, sectionsCount: 3 },
              aiProvider: 'gemini',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Darian AI response with cost sheet proposal',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'AI response text (may contain \\`\\`\\`json_annex_update blocks)' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
        '502': errorResponse502,
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // COST SHEETS (6 endpoints)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 6. POST /api/cost-sheets/calculate
  paths['/api/cost-sheets/calculate'] = {
    post: {
      tags: ['CostSheets'],
      operationId: 'calculateCostSheet',
      summary: 'Calculate cost sheet',
      description: `Validates and calculates a complete cost sheet (Ficha de Costo).
1. Schema validation via FichaJSONSchema
2. Semantic validation (cross-references, annex integrity)
3. Full calculation with cost engine

**Rate limit:** 60 req/min`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        description: 'Complete Ficha de Costo JSON matching FichaJSONSchema',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'FichaJSONSchema validated cost sheet data (complex structure)',
              properties: {
                meta: { type: 'object', description: 'Header metadata' },
                sections: { type: 'array', description: 'Cost sections with rows' },
                annexes: { type: 'array', description: 'Support annexes' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Calculation result',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean', const: true },
                  rows: { type: 'array', items: { type: 'object' } },
                  calculatedAnnexes: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        '400': {
          description: 'Validation error (schema or semantic)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean', const: false },
                  errors: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 7. POST /api/cost-sheets/export-pdf
  paths['/api/cost-sheets/export-pdf'] = {
    post: {
      tags: ['CostSheets'],
      operationId: 'exportCostSheetPdf',
      summary: 'Export cost sheet as PDF',
      description: `Generates a professional PDF for a cost sheet. Supports two modes:
- **Single mode**: Standard cost sheet PDF with header, sections table, and annexes
- **Comparison mode**: Side-by-side scenario comparison table

Returns the PDF as a binary stream with Content-Disposition header.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                result: { type: 'object', description: 'Calculation result with rows, header, metadata' },
                exportOptions: {
                  type: 'object',
                  properties: {
                    pdfFormat: { type: 'string', enum: ['standard', 'pro'] },
                  },
                },
                scenarioId: { type: 'string', description: 'Scenario ID for scenario PDFs' },
                exportMode: { type: 'string', enum: ['single', 'comparison'] },
                comparisonData: {
                  type: 'object',
                  description: 'Comparison mode data (sections, scenarios, calcs, baseId, activeScenarioIds)',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'PDF document',
          content: {
            'application/pdf': {
              schema: { type: 'string', format: 'binary' },
            },
          },
          headers: {
            'Content-Disposition': { description: 'attachment; filename="ficha-costo.pdf"', schema: { type: 'string' } },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 8. POST /api/cost-sheets/import-anexo
  paths['/api/cost-sheets/import-anexo'] = {
    post: {
      tags: ['CostSheets'],
      operationId: 'importAnexo',
      summary: 'Import annex data from CSV/Excel',
      description: 'Uploads a CSV or Excel (.xlsx/.xls) file containing annex data. Normalizes rows by classification and calculates import totals.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary', description: 'CSV or Excel file' },
                anexoId: { type: 'string', description: 'Target annex ID (e.g., "I", "II", "III")' },
              },
              required: ['file', 'anexoId'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Imported data with summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean' },
                  anexoId: { type: 'string' },
                  summary: {
                    type: 'object',
                    properties: {
                      rowCount: { type: 'integer' },
                      sumByClassification: { type: 'object', additionalProperties: { type: 'number' } },
                      totalImporte: { type: 'number' },
                    },
                  },
                  rows: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        '400': { description: 'Missing file/anexoId or unsupported format' },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 9. POST /api/cost-sheets/import-json
  paths['/api/cost-sheets/import-json'] = {
    post: {
      tags: ['CostSheets'],
      operationId: 'importCostSheetJson',
      summary: 'Import and validate cost sheet JSON',
      description: 'Validates a cost sheet JSON against FichaJSONSchema. Returns the validated ficha data.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        description: 'Cost sheet JSON matching FichaJSONSchema',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'FichaJSONSchema validated cost sheet data',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Validated cost sheet data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean', const: true },
                  ficha: { type: 'object', description: 'Validated ficha data' },
                },
              },
            },
          },
        },
        '400': {
          description: 'Validation errors',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean', const: false },
                  errors: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 10. POST /api/cost-sheets/save
  paths['/api/cost-sheets/save'] = {
    post: {
      tags: ['CostSheets'],
      operationId: 'saveCostSheet',
      summary: 'Save cost sheet to database',
      description: `Saves a cost sheet with AI-generated updates to the database.
1. Merges updateData with current or template data
2. Applies AI annex updates with robust matching (Roman numeral IDs, title matching)
3. Normalizes annex item keys per annex type
4. Runs cost engine calculation
5. Persists to Supabase with calculation snapshot

Supports scenario data and reset functionality.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CostSheetSaveRequest' },
            example: {
              updateData: {
                header: { name: 'Zapatos Deportivos', code: 'FC-001' },
                annexes: [
                  { id: 'I', data: [{ description: 'Cuero natural', um: 'm2', consumption_norm: '0.5', price: '25.00', total: '12.50', classification: '1.1.1' }] },
                ],
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Cost sheet saved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean', const: true },
                  message: { type: 'string' },
                  id: { type: 'string', format: 'uuid', description: 'Cost sheet ID' },
                  data: { type: 'object', description: 'Full exported data with calculation snapshot' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // ACADEMY (3 endpoints)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 11. POST /api/academy/generate
  paths['/api/academy/generate'] = {
    post: {
      tags: ['Academy'],
      operationId: 'generateLearningCards',
      summary: 'Generate AI learning cards from manual',
      description: `Generates educational flashcards from a manual PDF (pre-indexed as .txt).
Uses AI to chunk the manual text and create scenario-based questions.

**Rate limit:** 10 req/min
**Timeout:** 120 seconds (maxDuration)`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AcademyGenerateRequest' },
            example: {
              filename: 'Resolucion 148-2023.pdf',
              limit: 3,
              aiProvider: 'gemini',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Generated learning cards count',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string', example: 'Generadas 15 tarjetas desde Resolucion 148-2023.pdf' },
                  count: { type: 'integer', description: 'Number of cards generated' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '404': { description: 'Manual text file not found' },
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 12. GET /api/academy/review
  paths['/api/academy/review'] = {
    get: {
      tags: ['Academy'],
      operationId: 'getAcademyReview',
      summary: 'Get cards due for review',
      description: 'Returns learning cards that are due for spaced repetition review and new cards (up to 10) that the user has not seen yet.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        '200': {
          description: 'Due and new cards',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  due: { type: 'array', items: { type: 'object', description: 'User progress records with learning_cards relation' } },
                  new: { type: 'array', items: { type: 'object', description: 'New cards for the user (max 10)' } },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 13. POST /api/academy/review/{cardId}
  paths['/api/academy/review/{cardId}'] = {
    post: {
      tags: ['Academy'],
      operationId: 'reviewLearningCard',
      summary: 'Submit card review score (SM2 algorithm)',
      description: 'Records a review score (0-5) for a learning card. Uses the SM-2 spaced repetition algorithm to calculate the next review date and interval.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'Learning card UUID', schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AcademyReviewRequest' },
            example: { score: 4 },
          },
        },
      },
      responses: {
        '200': {
          description: 'Review recorded with new SM2 values',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  result: {
                    type: 'object',
                    properties: {
                      ease_factor: { type: 'number' },
                      interval_days: { type: 'integer' },
                      repetitions: { type: 'integer' },
                    },
                  },
                  newMastery: { type: 'number', description: 'Updated mastery score (0-100)' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // INVENTORY (5 endpoints)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 14. GET /api/inventory
  paths['/api/inventory'] = {
    get: {
      tags: ['Inventory'],
      operationId: 'listInventory',
      summary: 'List inventory items (paginated)',
      description: 'Returns paginated inventory items with product SKU and name. Supports filtering by SKU and store.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1, minimum: 1 } },
        { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 } },
        { name: 'sku', in: 'query', required: false, description: 'Filter by SKU (partial match)', schema: { type: 'string' } },
        { name: 'storeId', in: 'query', required: false, description: 'Filter by store UUID', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Paginated inventory list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/components/schemas/InventoryItem' } },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 15. GET /api/inventory/products
  paths['/api/inventory/products'] = {
    get: {
      tags: ['Inventory'],
      operationId: 'getInventoryProducts',
      summary: 'Get products for POS',
      description: 'Returns mapped products for the Point of Sale system, using the user\'s active store for stock calculation and multi-store isolation.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        '200': {
          description: 'POS-ready product list with stock data',
          content: {
            'application/json': {
              schema: { type: 'array', items: { type: 'object' }, description: 'Product list from get_products_for_pos RPC' },
            },
          },
        },
        '400': { description: 'User not assigned to a store' },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 16. POST /api/inventory/adjust
  paths['/api/inventory/adjust'] = {
    post: {
      tags: ['Inventory'],
      operationId: 'adjustInventory',
      summary: 'Adjust single product inventory',
      description: `Registers a stock movement for a single product. Uses optimistic concurrency control (version check).

**Possible errors:**
- 409: Version mismatch (stale data)
- 400: Insufficient stock (negative stock not allowed)`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/InventoryAdjustRequest' },
            example: {
              productId: '550e8400-e29b-41d4-a716-446655440000',
              storeId: '660e8400-e29b-41d4-a716-446655440001',
              quantity: 10,
              movementType: 'add',
              version: 5,
              reason: 'Stock receipt from supplier',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Adjustment applied',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdjustInventoryResponse' },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '409': errorResponse409,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 17. POST /api/inventory/adjustments
  paths['/api/inventory/adjustments'] = {
    post: {
      tags: ['Inventory'],
      operationId: 'batchInventoryAdjustments',
      summary: 'Batch inventory adjustment',
      description: 'Processes multiple inventory adjustments at once via the process_inventory_adjustment RPC. Creates a sale record with all items.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/InventoryAdjustmentsRequest' },
            example: {
              storeId: '660e8400-e29b-41d4-a716-446655440001',
              items: [
                { product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 5, movement_type: 'add', reason: 'Monthly restock' },
                { product_id: '550e8400-e29b-41d4-a716-446655440002', quantity: -2, reason: 'Damaged goods' },
              ],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Batch adjustment processed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string', example: 'Inventory adjustment processed successfully' },
                  saleId: { type: 'string', format: 'uuid' },
                  saleItems: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 18. GET /api/inventory/{productId}/history
  paths['/api/inventory/{productId}/history'] = {
    get: {
      tags: ['Inventory'],
      operationId: 'getProductStockHistory',
      summary: 'Get product stock movement history',
      description: 'Returns paginated stock movement ledger for a specific product.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'productId', in: 'path', required: true, description: 'Product UUID', schema: { type: 'string', format: 'uuid' } },
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', default: 20 } },
        { name: 'storeId', in: 'query', required: false, description: 'Filter by store', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Paginated stock movement history',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/components/schemas/InventoryMovement' } },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
        '400': { description: 'Missing productId' },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // REPORTS (1 endpoint)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 19. POST /api/reports/generate
  paths['/api/reports/generate'] = {
    post: {
      tags: ['Reports'],
      operationId: 'generateReport',
      summary: 'Generate PDF report',
      description: `Generates a PDF report for various data types and uploads it to Supabase storage.

**Supported types:** cost-sheet, inventory, sales, transfer, cash, profit, kardex, purchases, audit

For cost-sheet type: Uses the full ministry-formatted template with signatures.
For other types: Uses standard table report format.

Returns the public URL of the generated PDF.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ReportsGenerateRequest' },
            example: {
              type: 'sales',
              format: 'a4',
              orientation: 'landscape',
              from: '2025-01-01',
              to: '2025-01-31',
              store_id: '660e8400-e29b-41d4-a716-446655440001',
              name: 'Reporte de Ventas Enero',
              columns: ['created_at', 'total_amount', 'profiles.full_name'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Report generated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', const: true },
                  url: { type: 'string', format: 'uri', description: 'Public URL to the PDF' },
                  run_id: { type: 'string', format: 'uuid', description: 'Report run ID' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // USERS (4 endpoints)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 20. POST /api/users/managed-create
  paths['/api/users/managed-create'] = {
    post: {
      tags: ['Users'],
      operationId: 'managedCreateUser',
      summary: 'Create a new user (admin only)',
      description: `Creates a new user with specified role and store assignment.
Requires admin role. Encargado can create non-admin users.
If no password is provided, a recovery email is sent.

**Hierarchy:**
- Admin can create any role
- Encargado can create all roles except admin`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ManagedCreateUserRequest' },
            example: {
              p_email: 'newuser@example.com',
              p_full_name: 'Juan Pérez',
              p_role: 'encargado',
              p_store_id: '660e8400-e29b-41d4-a716-446655440001',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'User created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', const: true },
                  user_id: { type: 'string', format: 'uuid' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '403': errorResponse403,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 21. POST /api/users/toggle-status
  paths['/api/users/toggle-status'] = {
    post: {
      tags: ['Users'],
      operationId: 'toggleUserStatus',
      summary: 'Activate or deactivate a user',
      description: `Toggles a user's active status. Requires admin, encargado, superadmin, or manager role.
Action is logged to user_audit_log.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ToggleUserStatusRequest' },
            example: {
              user_id: '550e8400-e29b-41d4-a716-446655440000',
              is_active: false,
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Status toggled',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', const: true } } },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '403': errorResponse403,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 22. POST /api/users/delete
  paths['/api/users/delete'] = {
    post: {
      tags: ['Users'],
      operationId: 'deleteUser',
      summary: 'Delete a user (admin only)',
      description: 'Permanently deletes a user and their profile. Requires admin role. Calls managed_delete_user RPC for safety checks.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeleteUserRequest' },
            example: { user_id: '550e8400-e29b-41d4-a716-446655440000' },
          },
        },
      },
      responses: {
        '200': {
          description: 'User deleted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', const: true },
                  message: { type: 'string', example: 'Usuario eliminado correctamente' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '403': errorResponse403,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 23. POST /api/users/reset-password
  paths['/api/users/reset-password'] = {
    post: {
      tags: ['Users'],
      operationId: 'resetUserPassword',
      summary: 'Reset user password (admin only)',
      description: 'Sends a password recovery email to the target user. Requires admin role.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ResetPasswordRequest' },
            example: { user_id: '550e8400-e29b-41d4-a716-446655440000' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Recovery email sent',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', const: true },
                  message: { type: 'string', example: 'Se ha enviado un correo de recuperación al usuario.' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '403': errorResponse403,
        '404': { description: 'User not found' },
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // SYNC (1 endpoint)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 24. POST /api/sync/batch
  paths['/api/sync/batch'] = {
    post: {
      tags: ['Sync'],
      operationId: 'batchSync',
      summary: 'Batch sync operations with idempotency',
      description: `Processes multiple sync operations (sale, reception, adjustment, transfer) in a batch.
Uses idempotency keys to prevent duplicate processing.
Records all operations in sync_log.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                operations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      idempotencyKey: { type: 'string', description: 'Unique key for deduplication' },
                      entity: { type: 'string', enum: ['sale', 'reception', 'adjustment', 'transfer'] },
                      operationType: { type: 'string' },
                      payload: { type: 'object', description: 'Operation-specific payload' },
                    },
                    required: ['idempotencyKey', 'entity', 'operationType', 'payload'],
                  },
                },
              },
              required: ['operations'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Batch results',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        idempotencyKey: { type: 'string' },
                        status: { type: 'string', enum: ['ok', 'conflict', 'error'] },
                        serverId: { type: 'string' },
                        serverData: { type: 'object' },
                        error: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // OTHER (7 endpoints)
  // ═══════════════════════════════════════════════════════════════════════════════

  // 25. POST /api/logs
  paths['/api/logs'] = {
    post: {
      tags: ['Other'],
      operationId: 'logClientError',
      summary: 'Log client-side errors',
      description: 'Receives client-side error logs and appends them to ERROR_LOGS.md. Always returns 200 to avoid blocking the client flow.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LogEntry' },
            example: {
              context: 'POSCart',
              error: { message: 'Failed to process payment', code: 'PAYMENT_ERROR', stack: 'Error: ...\\n    at ...' },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Log received (always returns 200 even on failure)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  error: { type: 'string', description: 'Only present if silent failure' },
                },
              },
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '429': errorResponse429,
      },
    },
  };

  // 26. POST /api/pick3/sync
  paths['/api/pick3/sync'] = {
    post: {
      tags: ['Other'],
      operationId: 'syncPick3',
      summary: 'Sync Pick3 lottery results',
      description: `Synchronizes Pick3 lottery results from web sources and PDF.
Supports cron authentication via Bearer CRON_SECRET.
Can force a full sync with query parameter \`full=true\`.`,
      security: [
        { bearerAuth: [] },
        { cookieAuth: [] },
        { cronAuth: [] },
      ],
      parameters: [
        { name: 'full', in: 'query', required: false, description: 'Force full sync', schema: { type: 'boolean', default: false } },
      ],
      requestBody: { required: false, content: {} },
      responses: {
        '200': {
          description: 'Sync results',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  web_count: { type: 'integer', description: 'Results from web scraping' },
                  pdf_count: { type: 'integer', description: 'Results from PDF parsing' },
                  timestamp: { type: 'string', format: 'date-time' },
                  message: { type: 'string', description: 'Present on failure' },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 27. GET /api/rss
  paths['/api/rss'] = {
    get: {
      tags: ['Other'],
      operationId: 'getRssFeeds',
      summary: 'Fetch and parse RSS news feeds',
      description: `Fetches active RSS feeds from the database, parses them, and returns sorted news items.
Prioritizes items matching priority keywords (Tasas de cambio, CUP, Divisas, etc.).
Detects exchange rate data from Banco Central de Cuba.

**Cache:** Results cached for 60 minutes (revalidate: 3600)`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        '200': {
          description: 'RSS news items',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        link: { type: 'string', format: 'uri' },
                        pubDate: { type: 'string', format: 'date-time' },
                        content: { type: 'string' },
                        contentSnippet: { type: 'string' },
                        feedName: { type: 'string' },
                        isPriority: { type: 'boolean' },
                        isExchangeRate: { type: 'boolean' },
                        exchangeRateData: {
                          type: 'object',
                          properties: {
                            currency: { type: 'string' },
                            value: { type: 'number' },
                            date: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 28. GET /api/intelligence
  paths['/api/intelligence'] = {
    get: {
      tags: ['Other'],
      operationId: 'getIntelligence',
      summary: 'Get system intelligence data',
      description: 'Returns comprehensive system intelligence including architecture data, knowledge graph, audit info, pipeline state, and health summary.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        '200': {
          description: 'Intelligence data bundle',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  audit: { type: 'object', description: 'Architecture audit data' },
                  metrics: { type: 'object', description: 'Architecture metrics' },
                  graph: { type: 'object', description: 'Architecture graph' },
                  system: { type: 'object', description: 'System architecture' },
                  manifest: { type: 'object', description: 'Architecture manifest' },
                  changes: { type: 'object', description: 'Architecture changes' },
                  reviewQueue: { type: 'object', description: 'Pending review queue' },
                  pipelineState: { type: 'object', description: 'Pipeline state' },
                  integrityReport: { type: 'string', description: 'Integrity report content' },
                  knowledgeGraph: { type: 'object' },
                  userHelp: { type: 'object' },
                  views: { type: 'object' },
                  workflows: { type: 'object' },
                  components: { type: 'object' },
                  docsList: { type: 'array', items: { type: 'string' } },
                  healthSummary: {
                    type: 'object',
                    properties: {
                      timestamp: { type: 'string', format: 'date-time' },
                      integrityScore: { type: 'integer' },
                      status: { type: 'string', enum: ['STABLE', 'DEGRADED', 'CRITICAL'] },
                    },
                  },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 29. GET /api/system-health
  paths['/api/system-health'] = {
    get: {
      tags: ['System'],
      operationId: 'getSystemHealth',
      summary: 'Get system health metrics (SHI & MRI)',
      description: 'Returns System Health Index (SHI) and Market Readiness Index (MRI) with detailed infrastructure metrics.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        '200': {
          description: 'Health metrics',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  shi: { type: 'object', description: 'System Health Index calculation' },
                  mri: { type: 'object', description: 'Market Readiness Index with hard stops' },
                  auditAlerts: { type: 'integer', description: 'Number of pending audit alerts' },
                  lastAudit: { type: 'string' },
                  version: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  // 30. GET /api/system-health/knowledge
  paths['/api/system-health/knowledge'] = {
    get: {
      tags: ['System'],
      operationId: 'getKnowledgeHealth',
      summary: 'Get knowledge base health',
      description: 'Returns the knowledge graph, system architecture, and pipeline state for health monitoring.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        '200': {
          description: 'Knowledge base data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  knowledgeGraph: { type: 'object' },
                  systemArchitecture: { type: 'object' },
                  pipelineState: { type: 'object' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        '401': errorResponse401,
        '429': errorResponse429,
        '500': errorResponse500,
      },
    },
  };

  return spec;
}

export default createOpenAPISpec;
