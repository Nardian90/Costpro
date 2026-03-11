import { describe, it, expect } from 'vitest';
import { parseRawMessages } from '../parser';

describe('Wallet Parser Raw Messages', () => {
  it('should parse raw messages from complex text block', () => {
    const text = `Recibido 9 mar.
2026
9:17:54
p. m.
PAGOxMOVIL Banco Popular de Ahorro Ultimas operaciones.
Fecha;Servicio;Operacion;Monto;Moneda;NoTransaccion
28/11/2025;OTR;DB;5000.00;CUP;BR501ODE9F997 |
19/12/2025;OTR;DB;30000.00;CUP;AP5006X8JZ997 |
20/12/2025;OTR;DB;30000.00;CUP;AP5006XIEJ997 |`;

    const messages = parseRawMessages(text);
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('Recibido');
    expect(messages[0].date).toBe('9 mar. 2026 9:17:54 p. m.');
    expect(messages[0].nameNumber).toBe('PAGOxMOVIL Banco Popular de Ahorro Ultimas operaciones.');
    expect(messages[0].content).toContain('Fecha;Servicio;Operacion;Monto;Moneda;NoTransaccion');
    expect(messages[0].content).toContain('28/11/2025;OTR;DB;5000.00;CUP;BR501ODE9F997');
  });

  it('should parse multiple raw messages', () => {
    const text = `Recibido 1 mar.
2026
9:00:00
p. m.
Sender 1
Fecha;Servicio;Operacion;Monto;Moneda;NoTransaccion
01/01/2026;OTR;DB;100.00;CUP;TX1 |
Recibido 2 mar.
2026
10:00:00
p. m.
Sender 2
Fecha;Servicio;Operacion;Monto;Moneda;NoTransaccion
02/01/2026;OTR;DB;200.00;CUP;TX2 |`;

    const messages = parseRawMessages(text);
    expect(messages).toHaveLength(2);
    expect(messages[0].nameNumber).toBe('Sender 1');
    expect(messages[1].nameNumber).toBe('Sender 2');
  });
});
