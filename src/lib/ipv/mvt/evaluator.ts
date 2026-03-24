export function evaluateExpression(expression: string, context: Record<string, any>): string {
  try {
    // Basic template string resolution: "010({numero})"
    let resolved = expression.replace(/\{(\w+)\}/g, (_, key) => {
      return context[key] !== undefined ? String(context[key]) : `{${key}}`;
    });

    // Check if it's a numeric expression (simple arithmetic)
    if (/[+\-*/]/.test(resolved) && !/[a-zA-Z]/.test(resolved.replace(/\{.*\}/g, ''))) {
      // Safe evaluation for simple expressions like "10 * 5.5"
      // We use Function constructor only for controlled numeric strings
      try {
        const result = new Function(`return ${resolved}`)();
        return isNaN(result) ? resolved : String(result);
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

export function resolveDynamicValue(path: string, context: { product?: any, movement?: any, global?: any }): string {
  const parts = path.split('.');
  let current: any = context;

  for (const part of parts) {
    if (current && current[part] !== undefined) {
      current = current[part];
    } else {
      return '';
    }
  }

  return String(current ?? '');
}
