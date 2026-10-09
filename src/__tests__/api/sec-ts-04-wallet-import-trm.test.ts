import { describe, it, expect, vi, beforeEach } from 'vitest';
import CryptoJS from 'crypto-js';
import { POST } from '@/app/api/wallet/import-trm/route';
import {
  walletImportTrmSchema,
  WALLET_TRM_MAX_CHARS,
} from '@/validation/api-schemas';

/**
 * SEC-TS-04 · H7-TRM — POST /api/wallet/import-trm
 *
 * Antes: el body { content } (texto crudo del .trm) se procesaba SIN ningún
 * tope — req.json() bufferizaba, AES descifraba el ciphertext completo,
 * JSON.parse materializaba el árbol, decryptAllFields lo recorría
 * recursivamente duplicándolo y cada fila generaba un upsert service-role.
 * La App Router no impone body-size-limit y el deploy Docker no tiene tope
 * de plataforma → amplificación de memoria/CPU/DB sin cota. Además, un JSON
 * inválido producía 500 (json() sin catch).
 *
 * Después (patrón canónico H7 de SEC-TS-03 · import-excel):
 *   request → sesión (401 anónimo) → Content-Length declarado excesivo →
 *   413 temprano (optimización, NO barrera única) → JSON con catch → 400 →
 *   Zod walletImportTrmSchema (tope 10 MiB de texto) → 400/413 →
 *   processTrmBackup (validateTrmFormat + AES + walk) → upserts.
 *
 * El pipeline cripto es REAL (no se mockea transfermovil.ts): los .trm de
 * prueba se construyen con el cifrado real (H1 autokey + AES-256-ECB-PKCS7
 * + SHA-512), y processTrmBackup se envuelve en un spy para afirmar que los
 * payloads rechazados NUNCA llegan a descifrar/parsear.
 */

const USER_X = '9a222222-2222-4222-8222-999999999999';
const OTHER_USER = '00000000-dead-4beef-8bad-999999999999';

const sessionState = { value: null as any };

vi.mock('@/lib/auth', () => ({
  getServerSession: async () => sessionState.value,
}));

// COSTPRO 4: withRole('admin') consulta el perfil del solicitante vía
// supabase-admin — se mockea como admin para ejercitar el gate real.
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => adminProfileClient(),
  getSupabaseAdmin: () => adminProfileClient(),
}));

function adminProfileClient() {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: () => Promise.resolve({ data: { role: 'admin', roles: ['admin'] } }),
  };
  return {
    from: (table: string) => (table === 'user_store_memberships'
      ? { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }
      : chain),
  };
}

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// transfermovil — implementación REAL envuelta en spy: el descifrado real
// corre para los payloads aceptados; los rechazados nunca deben llegar.
const processTrmBackupSpy = vi.fn();
vi.mock('@/lib/transfermovil/transfermovil', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    processTrmBackup: (content: string) => {
      processTrmBackupSpy(content);
      return actual.processTrmBackup(content);
    },
  };
});

// supabase mock — upserts por fila + recálculo de saldos
const upsertMock = vi.fn();
const thenable = (result: any) => ({
  then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: any = {
        upsert: (...a: any[]) => {
          upsertMock(table, ...a);
          return thenable({ error: null });
        },
        select: () => chain,
        update: () => chain,
        eq: () => thenable({ data: [] }),
      };
      return chain;
    },
  }),
}));

// ── Constructor de .trm VÁLIDO con el cifrado real del formato ──────────────
// H1 (128 hex, clave autokey) + H2 (SHA-512 del plaintext, 128 hex) + C (base64)
function makeTrm(backup: unknown, opts: { corruptHash?: boolean } = {}): string {
  const plaintext = JSON.stringify(backup);
  const H1 = 'ab'.repeat(64);
  const key = CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(H1));
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plaintext), key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  const C = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  let H2 = CryptoJS.SHA512(CryptoJS.enc.Utf8.parse(plaintext)).toString(CryptoJS.enc.Hex);
  if (opts.corruptHash) {
    H2 = H2.endsWith('0') ? H2.slice(0, -1) + '1' : H2.slice(0, -1) + '0';
  }
  return H1 + H2 + C;
}

// Backup legítimo mínimo: 1 cuenta (cuenta cifrada con el vector de test real
// del módulo, descifra a '9224069993966692') + 2 transacciones completas.
const BACKUP = {
  cantidad_tablas: 2,
  fecha_exp: '2026-07-06',
  version_apk: 48,
  datos: [
    {
      tabla: 'CuentaBanco',
      dataJSON: [
        {
          id: 1,
          cuenta: 'NsauAIGRxUWfs5AOIqJHcJQhUU/7EjbIuUYni9c18rM=',
          descripcion: 'Cuenta principal',
          movil: '52345678',
          tipo_cuenta: 1,
        },
      ],
    },
    {
      tabla: 'RecordSMS',
      dataJSON: [
        { id: 1, fecha: 'Jul 4, 2026 7:28:50 AM', monto: '100.00', moneda: 'CUP', servicio: 'Transferencia', tipo_servicio: 'Pago BPA', idTransaccion: 'T-001', cuenta: '', mostrar: true },
        { id: 2, fecha: 'Jul 5, 2026 8:15:22 AM', monto: '40.00', moneda: 'CUP', servicio: 'Recarga Nauta', tipo_servicio: 'Recarga', idTransaccion: 'T-002', cuenta: '', mostrar: true },
      ],
    },
  ],
  scheme: [],
};

function makePostReq(body: any, headers: Record<string, string> = {}): any {
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/wallet/import-trm',
    headers: new Headers(headers),
    json: async () => body,
  };
}

function authedSession() {
  sessionState.value = { user: { id: USER_X } };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.value = null;
});

describe('SEC-TS-04 · H7-TRM — límite de payload server-side en import-trm', () => {
  it('sin sesión → 401 y NINGÚN descifrado (auth antes de todo procesamiento)', async () => {
    const res = await POST(makePostReq({ content: makeTrm(BACKUP) }));
    expect(res.status).toBe(401);
    expect(processTrmBackupSpy).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('.trm legítimo (pipeline cripto REAL) → 200, flujo existente intacto (1 cuenta + 2 transacciones)', async () => {
    authedSession();
    const res = await POST(makePostReq({ content: makeTrm(BACKUP) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.accounts).toBe(1);
    expect(json.transactions).toBe(2);
    expect(json.fecha_exp).toBe('2026-07-06');
    expect(processTrmBackupSpy).toHaveBeenCalledTimes(1);
  });

  it('cuenta cifrada del backup se descifra en el pipeline real (capa 2 con CV del módulo)', async () => {
    authedSession();
    const res = await POST(makePostReq({ content: makeTrm(BACKUP) }));
    expect(res.status).toBe(200);
    const accountUpsert = upsertMock.mock.calls.find(c => c[0] === 'wallet_accounts');
    expect(accountUpsert).toBeDefined();
    expect(accountUpsert![1].account_full).toBe('9224069993966692');
  });

  it('usuario autenticado → upserts SIEMPRE a su propio user_id aunque el body declare otro', async () => {
    authedSession();
    // intento de inyección de user_id ajeno: el schema lo descarta (z.object
    // strippea claves desconocidas) y la atribución viene solo de la sesión
    const res = await POST(makePostReq({ content: makeTrm(BACKUP), user_id: OTHER_USER }));
    expect(res.status).toBe(200);
    expect(upsertMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of upsertMock.mock.calls) {
      expect(call[1].user_id).toBe(USER_X);
    }
  });

  it('body sin content → 400 (schema .min(1)), sin descifrar', async () => {
    authedSession();
    const res = await POST(makePostReq({}));
    expect(res.status).toBe(400);
    expect(processTrmBackupSpy).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('content vacío → 400, sin descifrar', async () => {
    authedSession();
    const res = await POST(makePostReq({ content: '' }));
    expect(res.status).toBe(400);
    expect(processTrmBackupSpy).not.toHaveBeenCalled();
  });

  it('JSON inválido → 400 controlado (antes: 500 por json() sin catch)', async () => {
    authedSession();
    const req = {
      method: 'POST',
      url: 'http://localhost:3000/api/wallet/import-trm',
      headers: new Headers(),
      json: async () => {
        throw new Error('Unexpected token');
      },
    } as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(processTrmBackupSpy).not.toHaveBeenCalled();
  });

  it('payload EXACTAMENTE en el límite (10 MiB) → pasa el schema (límite inclusivo, llega a descifrar)', async () => {
    authedSession();
    // H1 hex + H2 hex + C base64 con longitud de bloque AES válida
    const content = 'a'.repeat(128) + 'b'.repeat(128) + 'c'.repeat(WALLET_TRM_MAX_CHARS - 256);
    expect(content.length).toBe(WALLET_TRM_MAX_CHARS);
    const res = await POST(makePostReq({ content }));
    // el tope inclusivo NO rechaza por tamaño: el contenido sintético llega
    // al descifrado (spy llamado) y falla allí con 400 — nunca 413
    expect(res.status).toBe(400);
    expect(processTrmBackupSpy).toHaveBeenCalledTimes(1);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('payload por ENCIMA del límite (10 MiB + 1) → 413 y el descifrado NUNCA ocurre', async () => {
    authedSession();
    const content = 'a'.repeat(WALLET_TRM_MAX_CHARS + 1);
    const res = await POST(makePostReq({ content }));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(processTrmBackupSpy).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('Content-Length AUSENTE (chunked) → el chequeo de contenido real sigue aplicando (barrera no única)', async () => {
    authedSession();
    // sin header content-length: un body real > límite debe caer en el schema
    const content = 'a'.repeat(WALLET_TRM_MAX_CHARS + 10);
    const res = await POST(makePostReq({ content }));
    expect(res.status).toBe(413);
    expect(processTrmBackupSpy).not.toHaveBeenCalled();
  });

  it('Content-Length declarado excesivo → 413 temprano SIN procesar', async () => {
    authedSession();
    const res = await POST(
      makePostReq(
        { content: makeTrm(BACKUP) },
        { 'content-length': String(WALLET_TRM_MAX_CHARS + 2049) }
      )
    );
    expect(res.status).toBe(413);
    expect(processTrmBackupSpy).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('.trm malformado (hash SHA-512 corrupto) → 400 controlado "Descifrado fallido", sin upserts', async () => {
    authedSession();
    const res = await POST(makePostReq({ content: makeTrm(BACKUP, { corruptHash: true }) }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toContain('Descifrado fallido');
    expect(processTrmBackupSpy).toHaveBeenCalledTimes(1);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('.trm demasiado corto → 400 controlado (validateTrmFormat, sin upserts)', async () => {
    authedSession();
    const res = await POST(makePostReq({ content: 'abc123' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toContain('Descifrado fallido');
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('SEC-TS-04 · H7-TRM — schema puro (walletImportTrmSchema)', () => {
  it('rechaza cadenas mayores al límite con code too_big (413 en la ruta)', () => {
    const result = walletImportTrmSchema.safeParse({ content: 'a'.repeat(WALLET_TRM_MAX_CHARS + 1) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === 'too_big')).toBe(true);
    }
  });

  it('acepta exactamente el límite (inclusivo) y rechaza ausencia/tipo incorrecto', () => {
    expect(walletImportTrmSchema.safeParse({ content: 'a'.repeat(WALLET_TRM_MAX_CHARS) }).success).toBe(true);
    expect(walletImportTrmSchema.safeParse({}).success).toBe(false);
    expect(walletImportTrmSchema.safeParse({ content: 12345 }).success).toBe(false);
    expect(walletImportTrmSchema.safeParse({ content: null }).success).toBe(false);
  });

  it('strippea claves desconocidas: user_id inyectado en el body NO llega a validated.data', () => {
    const result = walletImportTrmSchema.safeParse({ content: 'abc', user_id: OTHER_USER });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).user_id).toBeUndefined();
      expect(result.data.content).toBe('abc');
    }
  });
});
