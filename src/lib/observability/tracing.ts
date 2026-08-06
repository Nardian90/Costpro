/**
 * Iteración 11.5 — OpenTelemetry SDK setup for CostPro
 *
 * Aclaración 1: auto-instrumentations-node is NOT loaded — manual tracing only.
 * Uses BatchSpanProcessor + ConsoleSpanExporter → stdout (no SaaS).
 */

interface TracingSDK { start(): void }
let sdk: TracingSDK | null = null;

export async function setupTracing(): Promise<void> {
  if (sdk) return;

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions');
    const { ConsoleSpanExporter, BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');

    const SERVICE_NAME = 'costpro-enterprise';
    const SERVICE_VERSION = process.env.npm_package_version || '0.2.0';

    // Aclaración 1: NO auto-instrumentations — manual tracing only
    // Aclaración 4: stdout via ConsoleSpanExporter + BatchSpanProcessor (async)
    const spanProcessor = new BatchSpanProcessor(new ConsoleSpanExporter());

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      'deployment.environment': process.env.NODE_ENV || 'development',
    });

    // No instrumentations array — only manual spans via withTracing + rpc wrapper
    sdk = new NodeSDK({
      resource,
      spanProcessors: [spanProcessor],
    });

    sdk?.start();

    console.log(`[Tracing] OpenTelemetry initialized — service=${SERVICE_NAME} v${SERVICE_VERSION}, exporter=console-stdout, auto-instrumentation=disabled`);
  } catch (err) {
    console.error('[Tracing] Failed to initialize OpenTelemetry:', err);
  }
}
