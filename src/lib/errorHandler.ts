
// src/lib/errorHandler.ts
import { logger } from './logger';

/**
 * A centralized error handler that logs the error and returns a user-friendly message.
 * This prevents technical details and stack traces from being exposed to the end-user.
 */
export function handleError(error: unknown, context: Record<string, unknown> = {}) {
  // Log the full error for debugging and observability purposes.
  logger.error('DATABASE', 'An unexpected error occurred', {
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });

  // Return a generic, user-friendly message to avoid leaking sensitive information.
  return {
    success: false,
    message: 'An unexpected error occurred. Please try again later.',
  };
}
