export function evaluateExpression(expression: string, context: Record<string, any>): string {
  try {
    // Basic template string resolution: "010({numero})"
    let resolved = expression.replace(/\{([\w\.]+)\}/g, (_, key) => {
      const val = resolveDynamicValue(key, context);
      return val !== undefined ? String(val) : `{${key}}`;
    });

    // Check if it's a numeric expression (simple arithmetic)
    if (/[+\-*/]/.test(resolved) && !/[a-zA-Z]/.test(resolved.replace(/\{.*\}/g, ''))) {
      // Safe evaluation for simple expressions like "10 * 5.5"
      try {
        // Remove whitespace and check for safety
        const safeExpr = resolved.replace(/\s/g, '');
        if (/^[0-9+\-*/().]+$/.test(safeExpr)) {
             const result = new Function(`return ${safeExpr}`)();
             return isNaN(result) ? resolved : String(result);
        }
        return resolved;
      } catch {
        return resolved;
      }
    }

    return resolved;
  } catch (e) {
    console.error("Expression evaluation error:", e, expression);
    return expression;
  }
}

export function resolveDynamicValue(path: string, context: any): string {
  const parts = path.split('.');
  let current: any = context;

  for (const part of parts) {
    if (current && current[part] !== undefined) {
      current = current[part];
    } else {
      // Fallback for common top-level fields
      if (path === 'numero' && context.global?.numero !== undefined) return String(context.global.numero);
      if (path === 'fecha' && context.global?.fecha !== undefined) return String(context.global.fecha);
      if (path === 'importe' && context.global?.importe !== undefined) return String(context.global.importe);

      return '';
    }
  }

  if (typeof current === 'object' && current !== null) {
      return '';
  }

  return String(current ?? '');
}
