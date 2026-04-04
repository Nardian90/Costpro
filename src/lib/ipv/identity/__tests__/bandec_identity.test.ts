import { expect, test, describe } from 'vitest';
import { extractIdentity } from '../mapping-engine';
import { normalizeName } from '../normalization';

describe('BANDEC Identity Extraction', () => {
  test('should extract name, CI and card from the user example 1', () => {
    const cleanObs = "CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311151131450] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 92270 6XXXXXX1304ID:0664634000421716IDCUBACEL:3462668014TS:07-TransferenciaFECHA FA CTURA: 0126INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA OR DENANTE NOMBRE:SUSANA ROSABAL CABALLER| CI:00052476736 | Tarjeta RED:92270699 94281304";
    const id = extractIdentity(cleanObs);
    expect(id.nombre).toBe('SUSANA ROSABAL CABALLER');
    expect(id.ci).toBe('00052476736');
    expect(id.card).toBe('9227069994281304');
  });

  test('should extract name with dots (JOSE G. AGUILERA DE AVI)', () => {
    const cleanObs = "CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311151114408] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 92440 6XXXXXX3757ID:0664634000421716IDCUBACEL:3548329442TS:07-TransferenciaFECHA FA CTURA: 0126INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA OR DENANTE NOMBRE:JOSE G. AGUILERA DE AVI| CI:64112104629 | Tarjeta RED:92440699 91023757";
    const id = extractIdentity(cleanObs);
    expect(id.nombre).toBe('JOSE G. AGUILERA DE AVI');
    expect(id.ci).toBe('64112104629');
    expect(id.card).toBe('9244069991023757');
  });

  test('should extract name with dots (ANA G. ARIAS GONZALEZ)', () => {
    const cleanObs = "CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311250583230] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 92240 6XXXXXX8266ID:0664634000421716IDCUBACEL:3600797006TS:07-TransferenciaFECHA FA CTURA: 0126INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA OR DENANTE NOMBRE:ANA G. ARIAS GONZALEZ| CI:71041522993 | Tarjeta RED:9224069999 278266";
    const id = extractIdentity(cleanObs);
    expect(id.nombre).toBe('ANA G. ARIAS GONZALEZ');
    expect(id.ci).toBe('71041522993');
    expect(id.card).toBe('9224069999278266');
  });

  test('should handle "NOMBRE:" variant', () => {
      const obs = "NOMBRE:JUAN PEREZ| Tarjeta RED:1234123412341234";
      const id = extractIdentity(obs);
      expect(id.nombre).toBe('JUAN PEREZ');
      expect(id.card).toBe('1234123412341234');
  });

  test('should ignore cards that are not 16 digits', () => {
      const obs = "NOMBRE:TEST| Tarjeta RED:12345";
      const id = extractIdentity(obs);
      expect(id.card).toBeUndefined();
  });
});

describe('Name Normalization and Deduplication', () => {
    test('should identify "ARN ALDO" and "ARNALDO" as same name if spaces are removed', () => {
        const name1 = "ARN ALDO AGUILERA REYES";
        const name2 = "ARNALDO AGUILERA REYES";

        const norm1 = normalizeName(name1).replace(/\s+/g, '');
        const norm2 = normalizeName(name2).replace(/\s+/g, '');

        expect(norm1).toBe(norm2);
    });
});
