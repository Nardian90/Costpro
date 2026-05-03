/**
 * OpenTelemetry distributed tracing SDK setup for CostPro Enterprise.
 *
 * Initializes the NodeSDK with OTLP exporter (configurable via env),
 * console span exporter as fallback for development, and auto-instrumentations.
 *
 * IMPORTANT: This module imports heavy Node.js SDK packages. It is ONLY loaded
 * via instrumentation.ts with a dynamic import(), and only when OTEL_ENABLED=true
 * or NODE_ENV=production.
 *
 * For lightweight span operations used by API routes, use tracing-core.ts instead.
 * The barrel export (index.ts) does NOT re-export anything from this file.
 */

import type { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry tracing. Safe to call multiple times (idempotent).
 */
export async function setupTracing(): Promise<void> {
  if (sdk) return;

  try {
    // Dynamic imports to avoid Turbopack static analysis failures
    // These packages use Node.js-specific module resolution
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { ConsoleSpanExporter, SimpleSpanProcessor, BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

    const SERVICE_NAME = 'costpro-enterprise';
    const SERVICE_VERSION = process.env.npm_package_version || '0.2.0';
    const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

    const exporters: InstanceType<typeof BatchSpanProcessor | typeof SimpleSpanProcessor>[] = [];

    if (process.env.NODE_ENV !== 'production') {
      exporters.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    }

    try {
      exporters.push(new BatchSpanProcessor(new OTLPTraceExporter({ url: OTEL_ENDPOINT })));
    } catch {
      console.warn('[Tracing] OTLP exporter initialization failed, using console fallback only');
    }

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      'deployment.environment': process.env.NODE_ENV || 'development',
    });

    const instrumentations = getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-net': { enabled: true },
      '@opentelemetry/instrumentation-dns': { enabled: true },
    });

    sdk = new NodeSDK({ resource, spanProcessors: exporters, instrumentations });
    sdk.start();

    console.log(`[Tracing] OpenTelemetry initialized — service=${SERVICE_NAME} v${SERVICE_VERSION}, endpoint=${OTEL_ENDPOINT}`);
  } catch (err) {
    console.error('[Tracing] Failed to initialize OpenTelemetry:', err);
  }
}
