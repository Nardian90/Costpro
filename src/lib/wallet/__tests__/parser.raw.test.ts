import { describe, it, expect } from 'vitest';
import { extractRawMessages } from '../parser';

describe('Wallet Parser Raw Messages', () => {
  it('should split multi-line table into separate rows and keep headers', () => {
    const text = `Recibido 9 mar.
2026
9:17:54
p. m.
PAGOxMOVIL Banco Popular de Ahorro Ultimas operaciones.
Fecha;Servicio;Operacion;Monto;Moneda;NoTransaccion
28/11/2025;OTR;DB;5000.00;CUP;BR501ODE9F997 |
19/12/2025;OTR;DB;30000.00;CUP;AP5006X8JZ997 |
20/12/2025;OTR;DB;30000.00;CUP;AP5006XIEJ997 |`;

    const messages = extractRawMessages(text);
    // Should be 3 rows (one for each data line)
    expect(messages).toHaveLength(3);
    expect(messages[0].date).toBe('9 mar. 2026 9:17:54 p. m.');
    expect(messages[0].nameNumber).toBe('PAGOxMOVIL');

    // Header should be present in content
    expect(messages[0].content).toContain('PAGOxMOVIL Banco Popular de Ahorro Ultimas operaciones.');
    expect(messages[0].content).toContain('Fecha;Servicio;Operacion;Monto;Moneda;NoTransaccion');
    expect(messages[0].content).toContain('28/11/2025;OTR;DB;5000.00;CUP;BR501ODE9F997');
  });

  it('should parse single operation messages correctly', () => {
    const text = `Recibido 9 mar.
2026
8:48:53
p. m.
PAGOxMOVIL Banco Popular de Ahorro: La consulta de saldo fue completada. Saldo Disponible: CR
80914.49 CUP`;

    const messages = extractRawMessages(text);
    expect(messages).toHaveLength(1);
    expect(messages[0].date).toBe('9 mar. 2026 8:48:53 p. m.');
    expect(messages[0].nameNumber).toBe('PAGOxMOVIL');
    expect(messages[0].content).toContain('Banco Popular de Ahorro: La consulta de saldo fue completada.');
  });

  it('should handle mixed content', () => {
    const text = `Recibido 1 mar.
2026
Sender1
Line 1
Line 2
Recibido 2 mar.
2026
Sender2
Fecha;Servicio;Operacion;Monto;Moneda;NoTransaccion
02/01/2026;OTR;DB;200.00;CUP;TX2 |`;

    const messages = extractRawMessages(text);
    expect(messages).toHaveLength(2);
    expect(messages[0].nameNumber).toBe('Sender1');
    expect(messages[0].content).toContain("Line 1\nLine 2");
    expect(messages[1].nameNumber).toBe('Sender2');
    expect(messages[1].content).toContain('02/01/2026;OTR;DB;200.00;CUP;TX2');
  });
});
