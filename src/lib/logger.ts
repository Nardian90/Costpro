
// src/lib/logger.ts

/**
 * Defines the structure for a log entry, ensuring consistency across the application.
 * Each log should have a clear category, a specific event name, and an optional data payload.
 */
interface LogEntry {
  category: 'AUTH' | 'POS' | 'AUDIT' | 'INVENTORY' | 'COST_SHEET' | 'DATABASE' | 'PICK3' | 'SYNC' | 'ACADEMY' | 'AI' | 'REPORTS' | 'LEGAL' | 'SYSTEM' | 'VALIDATION' | 'UI' | 'FC' | 'HEALTH' | 'QUOTA' | 'TELEMETRY'; // FIX-INF-022 + FIX-FC-PERSIST-V2 + Audit-Fix #2d (añadido HEALTH, QUOTA, TELEMETRY)
  event: string;
  data?: Record<string, unknown>;
  level: 'info' | 'warn' | 'error';
}

/**
 * A simple, structured logger that outputs JSON to the console.
 * This can be easily replaced with a more sophisticated logging service in the future.
 */
class Logger {
  private log(entry: LogEntry) {
    // In a real production environment, this would send the log to a service like Sentry, Datadog, or LogRocket.
    // For now, we'll just use the console, but in a structured way.
    console[entry.level](JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }));
  }

  info(category: LogEntry['category'], event: string, data?: Record<string, unknown>) {
    this.log({ level: 'info', category, event, data });
  }

  warn(category: LogEntry['category'], event: string, data?: Record<string, unknown>) {
    this.log({ level: 'warn', category, event, data });
  }

  error(category: LogEntry['category'], event: string, data?: Record<string, unknown>) {
    this.log({ level: 'error', category, event, data });
  }
}

// Export a singleton instance of the logger to be used throughout the application.
export const logger = new Logger();
