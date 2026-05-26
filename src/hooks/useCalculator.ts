'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Parser } from 'expr-eval';

/* ─────────────────────────────────────────────────────
 *  formatResult — limita decimales a 8 y longitud a 15
 * ───────────────────────────────────────────────────── */
function formatResult(result: number): string {
  if (!isFinite(result) || isNaN(result)) return 'Error';
  const resultStr = String(Number(result.toFixed(8)));
  return resultStr.length > 15 ? result.toExponential(4) : resultStr;
}

/* ─────────────────────────────────────────────────────
 *  useCalculator — shared calculator logic (CSP-safe)
 *
 *  BUG-FIX LIST:
 *    BF-01  Replaced new Function() with expr-eval (CSP strict-dynamic)
 *    BF-02  Decimal: '0.' instead of '.' on first press
 *    BF-03  Prevent multiple decimals in same number
 *    BF-04  Division by zero → 'Error' (not Infinity)
 *    BF-05  Operator chaining: 9+5-3 evaluates intermediate results
 *    BF-06  Replace operator when pressing another operator consecutively
 *    BF-07  Clear 'Error' state on new number input
 *    BF-08  Backspace blocked when showing previous result
 *    BF-09  Percent (%) divides current value by 100
 *    BF-10  Toggle sign (+/-) negates current display
 *    BF-11  handlersRef pattern for stable keyboard listeners
 * ───────────────────────────────────────────────────── */
export function useCalculator() {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [lastResult, setLastResult] = useState<number | null>(null);
  // BF-01: expr-eval does NOT use Function constructor — CSP-safe
  const parser = useMemo(() => new Parser(), []);

  /* ── Number input ───────────────────────────────── */
  const handleNumber = useCallback((num: string) => {
    // BF-07: clear error state on new input
    if (display === 'Error') {
      setDisplay(num === '.' ? '0.' : num);
      setEquation('');
      setLastResult(null);
      return;
    }
    // BF-03: prevent multiple decimals
    if (num === '.' && display.includes('.')) return;
    // BF-02: '0' + '.' → '0.' ; '0' + digit → digit
    if (display === '0' && num === '.') { setDisplay('0.'); return; }
    if (display === '0' && num !== '.') { setDisplay(num); return; }
    // After a result, start fresh entry
    if (lastResult !== null) {
      setDisplay(num === '.' ? '0.' : num);
      setLastResult(null);
      return;
    }
    // Max 15 significant digits
    if (display.replace(/[^0-9]/g, '').length >= 15) return;
    setDisplay(display + num);
  }, [display, lastResult]);

  /* ── Operator input ─────────────────────────────── */
  const handleOperator = useCallback((op: string) => {
    if (display === 'Error') return;

    // BF-05: chain — evaluate pending equation first
    if (equation && lastResult === null && display !== '0') {
      try {
        const fullEq = (equation + display).replace(/[^-0-9+*/.() ]/g, '').trim();
        const result = parser.evaluate(fullEq);
        if (!isFinite(result) || isNaN(result)) { setDisplay('Error'); return; }
        const formatted = formatResult(result);
        setEquation(formatted + ' ' + op + ' ');
        setDisplay(formatted);
        setLastResult(result);
      } catch {
        setDisplay('Error');
      }
      return;
    }

    // BF-06: replace operator when pressing consecutively
    if (equation) {
      const parts = equation.trimEnd().split(' ');
      parts[parts.length - 1] = op;
      setEquation(parts.join(' ') + ' ');
      if (lastResult !== null) {
        setDisplay('0');
        setLastResult(null);
      }
      return;
    }

    // Start new equation
    setEquation(display + ' ' + op + ' ');
    setLastResult(null);
    setDisplay('0');
  }, [display, equation, lastResult, parser]);

  /* ── Calculate (=) ──────────────────────────────── */
  const handleCalculate = useCallback(() => {
    if (!equation || display === 'Error') return;
    try {
      const fullEq = (equation + display).replace(/[^-0-9+*/.() ]/g, '').trim();
      const result = parser.evaluate(fullEq);
      // BF-04: division by zero & NaN → Error
      if (!isFinite(result) || isNaN(result)) {
        setDisplay('Error');
        setEquation('');
        return;
      }
      const formatted = formatResult(result);
      setDisplay(formatted);
      setEquation('');
      setLastResult(result);
    } catch {
      setDisplay('Error');
      setEquation('');
    }
  }, [display, equation, parser]);

  /* ── Clear (AC) ─────────────────────────────────── */
  const handleClear = useCallback(() => {
    setDisplay('0');
    setEquation('');
    setLastResult(null);
  }, []);

  /* ── Backspace (⌫) ──────────────────────────────── */
  const handleBackspace = useCallback(() => {
    if (display === 'Error') { handleClear(); return; }
    // BF-08: don't erase a previous result
    if (lastResult !== null) return;
    setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  }, [lastResult, handleClear]);

  /* ── Percent (%) — BF-09 ─────────────────────────── */
  const handlePercent = useCallback(() => {
    if (display === 'Error' || display === '0') return;
    const current = parseFloat(display);
    if (isNaN(current)) return;
    const result = current / 100;
    setDisplay(formatResult(result));
    setLastResult(null);
  }, [display]);

  /* ── Toggle sign (±) — BF-10 ────────────────────── */
  const handleToggleSign = useCallback(() => {
    if (display === 'Error' || display === '0') return;
    setDisplay(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
  }, [display]);

  /* ── Stable ref for keyboard listeners — BF-11 ─── */
  const handlersRef = useRef({
    handleNumber, handleOperator, handleCalculate,
    handleClear, handleBackspace, handlePercent, handleToggleSign,
  });
  handlersRef.current = {
    handleNumber, handleOperator, handleCalculate,
    handleClear, handleBackspace, handlePercent, handleToggleSign,
  };

  return {
    display,
    equation,
    lastResult,
    handleNumber,
    handleOperator,
    handleCalculate,
    handleClear,
    handleBackspace,
    handlePercent,
    handleToggleSign,
    handlersRef,
  };
}
