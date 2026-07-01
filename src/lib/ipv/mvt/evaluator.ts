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
             const result = simpleMathEval(safeExpr);
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

/**
 * A safe, simple math evaluator for basic arithmetic.
 * Implements a basic Shunting-yard-like approach or simple recursive descent.
 */
function simpleMathEval(expr: string): number {
  // Simple regex-based tokenizer for numbers and operators
  const tokens = expr.match(/\d+\.?\d*|[+\-*/()]/g);
  if (!tokens) return NaN;

  const ops: string[] = [];
  const values: number[] = [];

  const precedence: Record<string, number> = {
    '+': 1, '-': 1,
    '*': 2, '/': 2
  };

  const applyOp = () => {
    const op = ops.pop();
    const b = values.pop();
    const a = values.pop();
    if (a === undefined || b === undefined) return;
    switch (op) {
      case '+': values.push(a + b); break;
      case '-': values.push(a - b); break;
      case '*': values.push(a * b); break;
      case '/': values.push(a / b); break;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/\d/.test(t)) {
      values.push(parseFloat(t));
    } else if (t === '(') {
      ops.push(t);
    } else if (t === ')') {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') {
        applyOp();
      }
      ops.pop(); // pop '('
    } else {
      while (ops.length > 0 && precedence[ops[ops.length - 1]] >= precedence[t]) {
        applyOp();
      }
      ops.push(t);
    }
  }

  while (ops.length > 0) {
    applyOp();
  }

  return values[0];
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
