export function evaluateExpression(expression: string, context: Record<string, any>): string {
  try {
    let resolved = expression.replace(/\{([\w\.]+)\}/g, (_, key) => {
      const val = resolveDynamicValue(key, context);
      return val !== undefined ? String(val) : `{${key}}`;
    });

    if (/[+\-*/]/.test(resolved) && !/[a-zA-Z]/.test(resolved.replace(/\{.*\}/g, ''))) {
      try {
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
 * A basic and safe math evaluator for simple expressions.
 * Does not use `new Function` or `eval`.
 * Supports +, -, *, /, (, ).
 */
function simpleMathEval(expr: string): number {
    try {
        // Tokenizer
        const tokens = expr.match(/\d+(\.\d+)?|[+\-*/()]/g);
        if (!tokens) return NaN;

        const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
        const output: (number | string)[] = [];
        const operators: string[] = [];

        for (const token of tokens) {
            if (/\d/.test(token)) {
                output.push(parseFloat(token));
            } else if (token === '(') {
                operators.push(token);
            } else if (token === ')') {
                while (operators.length && operators[operators.length - 1] !== '(') {
                    output.push(operators.pop()!);
                }
                operators.pop();
            } else {
                while (operators.length && precedence[operators[operators.length - 1]] >= precedence[token]) {
                    output.push(operators.pop()!);
                }
                operators.push(token);
            }
        }
        while (operators.length) {
            output.push(operators.pop()!);
        }

        const stack: number[] = [];
        for (const token of output) {
            if (typeof token === 'number') {
                stack.push(token);
            } else {
                const b = stack.pop()!;
                const a = stack.pop()!;
                switch (token) {
                    case '+': stack.push(a + b); break;
                    case '-': stack.push(a - b); break;
                    case '*': stack.push(a * b); break;
                    case '/': stack.push(a / b); break;
                }
            }
        }
        return stack[0];
    } catch {
        return NaN;
    }
}

export function resolveDynamicValue(path: string, context: any): string {
  const parts = path.split('.');
  let current: any = context;

  for (const part of parts) {
    if (current && current[part] !== undefined) {
      current = current[part];
    } else {
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
