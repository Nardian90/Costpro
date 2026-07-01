/**
 * Type stubs for OpenTelemetry SDK modules.
 * These packages are dynamically imported at runtime (only in production / when OTEL_ENABLED=true)
 * and are NOT installed in development. This file prevents TypeScript errors while keeping
 * the actual imports dynamic and optional.
 */

declare module '@opentelemetry/sdk-node' {
  export class NodeSDK {
    constructor(opts: {
      resource?: any;
      spanProcessors?: any[];
      instrumentations?: any[];
    });
    start(): void;
  }
}

declare module '@opentelemetry/resources' {
  export function resourceFromAttributes(attrs: Record<string, string>): any;
}

declare module '@opentelemetry/semantic-conventions' {
  export const ATTR_SERVICE_NAME: string;
  export const ATTR_SERVICE_VERSION: string;
}

declare module '@opentelemetry/exporter-trace-otlp-http' {
  export class OTLPTraceExporter {
    constructor(opts?: { url?: string });
  }
}

declare module '@opentelemetry/sdk-trace-base' {
  export class ConsoleSpanExporter {}
  export class SimpleSpanProcessor {
    constructor(exporter: any);
  }
  export class BatchSpanProcessor {
    constructor(exporter: any);
  }
}

declare module '@opentelemetry/auto-instrumentations-node' {
  export function getNodeAutoInstrumentations(opts?: Record<string, any>): any[];
}

/**
 * Type stubs for Upstash modules.
 * These packages are dynamically imported at runtime and only used when UPSTASH_REDIS_REST_URL is set.
 * They are NOT installed in development environments without Upstash configuration.
 */

declare module '@upstash/ratelimit' {
  export class Ratelimit {
    constructor(opts: { redis: any; limiter: any; analytics?: boolean; prefix?: string });
    limit(identifier: string): Promise<{ success: boolean; remaining: number; reset: number }>;
    static slidingWindow(limit: number, window: string): any;
  }
}

declare module '@upstash/redis' {
  export class Redis {
    static fromEnv(): Redis;
  }
}
