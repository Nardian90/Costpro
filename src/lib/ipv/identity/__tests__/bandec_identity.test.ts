import { expect, test, describe } from 'vitest';
import { extractIdentity } from '../mapping-engine';

describe('BANDEC Identity Extraction', () => {
  test('should extract name, CI and card from the user example', () => {
    // String as it would look after BANDEC parser normalization
    const cleanObs = "CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311151131450] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 92270 6XXXXXX1304ID:0664634000421716IDCUBACEL:3462668014TS:07-TransferenciaFECHA FA CTURA: 0126INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA OR DENANTE NOMBRE:SUSANA ROSABAL CABALLER| CI:00052476736 | Tarjeta RED:92270699 94281304";

    const id = extractIdentity(cleanObs);

    expect(id.nombre).toBe('SUSANA ROSABAL CABALLER');
    expect(id.ci).toBe('00052476736');
    expect(id.card).toBe('9227069994281304');
  });

  test('should handle "NOMBRE:" variant', () => {
      const obs = "NOMBRE:JUAN PEREZ| Tarjeta RED:1234123412341234";
      const id = extractIdentity(obs);
      expect(id.nombre).toBe('JUAN PEREZ');
      expect(id.card).toBe('1234123412341234');
  });

  test('should handle "ORDENANTE NOMBRE:" variant', () => {
      const obs = "ORDENANTE NOMBRE:MARIA LOPEZ| CI:12345678901 | Tarjeta RED:9999888877776666";
      const id = extractIdentity(obs);
      expect(id.nombre).toBe('MARIA LOPEZ');
      expect(id.ci).toBe('12345678901');
      expect(id.card).toBe('9999888877776666');
  });

  test('should ignore cards that are not 16 digits', () => {
      const obs = "NOMBRE:TEST| Tarjeta RED:12345";
      const id = extractIdentity(obs);
      expect(id.card).toBeUndefined();
  });
});
