/**
 * safe-parser.ts — Wrapper seguro que reemplaza expr-eval con mathjs.
 *
 * PROBLEMA: expr-eval tiene prototype pollution (GHSA-8gw3-rxh4-v6jx)
 * y evaluación de funciones sin restricción (GHSA-jc85-fpwf-qm7x).
 *
 * SOLUCIÓN: Usar mathjs que es seguro y mantiene API compatible.
 *
 * Este wrapper expone las mismas funciones que expr-eval:
 *   - Parser class con .parse() y .evaluate()
 *   - parser.functions registro de funciones custom
 *   - Expression.evaluate(context)
 *
 * Uso (drop-in replacement):
 *   ANTES: import { Parser } from 'expr-eval';
 *   AHORA: import { Parser } from '@/lib/cost-engine/safe-parser';
 */

import { evaluate as mathEvaluate, parse as mathParse, type MathNode } from 'mathjs';

export type ExprValue = string | number | boolean;

export interface Expression {
  evaluate(context?: Record<string, ExprValue>): ExprValue;
}

export class Parser {
  functions: Record<string, (...args: any[]) => any> = {};

  /**
   * Evaluación directa — devuelve number (0 si no es numérico).
   * Compatible con el API que usaban useCalculator y FloatingCalculator.
   */
  evaluate(expression: string, context?: Record<string, ExprValue>): number {
    const compiled = this.parse(expression);
    const result = compiled.evaluate(context);
    if (typeof result === 'number') return result;
    if (typeof result === 'string') return parseFloat(result) || 0;
    if (typeof result === 'boolean') return result ? 1 : 0;
    return 0;
  }

  parse(expression: string): Expression {
    // Pre-validar: rechazar expresiones peligrosas
    const lowerExpr = expression.toLowerCase();
    if (lowerExpr.includes('__proto__') || lowerExpr.includes('constructor') || lowerExpr.includes('prototype')) {
      throw new Error('Expresión contiene términos prohibidos');
    }

    let node: MathNode;
    try {
      node = mathParse(expression);
    } catch (e: any) {
      throw new Error(`Expresión inválida: ${e.message}`);
    }

    return {
      evaluate: (context?: Record<string, ExprValue>): ExprValue => {
        try {
          // Combinar funciones registradas con el contexto
          const scope: Record<string, any> = { ...this.functions, ...context };
          const result = node.evaluate(scope);

          // Convertir resultado a tipo simple
          if (typeof result === 'number') return result;
          if (typeof result === 'boolean') return result;
          if (typeof result === 'string') return result;
          if (result === null || result === undefined) return 0;
          // mathjs puede devolver objetos complejos — convertir a número
          const num = Number(result);
          return isNaN(num) ? 0 : num;
        } catch (e: any) {
          throw new Error(`Error evaluando: ${e.message}`);
        }
      },
    };
  }
}

export type Values = Record<string, ExprValue>;
