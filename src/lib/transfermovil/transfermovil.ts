/**
 * transfermovil.ts
 *
 * Descifrado de respaldos .trm de Transfermovil (Cuba)
 * para integración en aplicaciones web.
 *
 * Compatible con Node.js (>= 14) y navegadores modernos.
 *
 * Uso:
 *   import { processTrmBackup } from './transfermovil';
 *   const text = await file.text();          // File API del navegador
 *   const result = processTrmBackup(text);
 *   if (result.ok) {
 *     console.log(result.data);              // JSON descifrado completo
 *   } else {
 *     console.error(result.error);
 *   }
 *
 * Dependencias:
 *   npm install crypto-js @types/crypto-js
 */

import CryptoJS from 'crypto-js';

// =====================================================================
// CONSTANTES (extraídas del APK oficial cu.etecsa.cubacel.tr.tm)
// =====================================================================

/**
 * Clave hardcodeada en la clase
 * cu.etecsa.cubacel.tr.tm.H50HN6MN7mD.G9bhugRzNv (línea 62 del .java)
 * Se usa para descifrar los campos sensibles dentro del JSON
 * (números de cuenta, cuentas Nauta, etc.)
 */
export const CV_HARDCODED = '708091521823824654864548452244';

// =====================================================================
// TIPOS
// =====================================================================

export interface TransfermovilBackup {
  cantidad_tablas: number;
  fecha_exp: string;
  version_apk: number;
  datos: TransfermovilTable[];
  scheme: TransfermovilScheme[];
}

export interface TransfermovilTable {
  tabla: string;
  dataJSON: Record<string, any>[];
}

export interface TransfermovilScheme {
  tabla: string;
  columns: any[];
}

export interface DecryptionResult {
  ok: boolean;
  error?: string;
  data?: TransfermovilBackup;
  rawJson?: string;
}

// =====================================================================
// FUNCIONES DE CIFRADO BASE
// =====================================================================

function sha256Bytes(text: string): CryptoJS.lib.WordArray {
  return CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(text));
}

function sha512Hex(bytes: CryptoJS.lib.WordArray | string): string {
  const input = typeof bytes === 'string'
    ? CryptoJS.enc.Utf8.parse(bytes)
    : bytes;
  return CryptoJS.SHA512(input).toString(CryptoJS.enc.Hex);
}

/**
 * Descifra AES-256-ECB-PKCS5Padding.
 * @param ciphertextBase64  ciphertext en base64 (sin saltos)
 * @param keyUtf8           passphrase ASCII (se aplica SHA-256 para obtener la key AES)
 */
function aesEcbDecrypt(ciphertextBase64: string, keyUtf8: string): string {
  const key = sha256Bytes(keyUtf8);                  // 32 bytes -> AES-256
  const ciphertext = CryptoJS.enc.Base64.parse(ciphertextBase64);

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext } as any,
    key,
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,    // PKCS7 == PKCS5 para AES (bloque 16)
    }
  );

  return decrypted.toString(CryptoJS.enc.Utf8);
}

// =====================================================================
// VALIDACIÓN DE FORMATO (sin descifrar)
// =====================================================================

/**
 * Comprueba si un string tiene la estructura de un .trm válido.
 * No descifra nada; solo valida la forma.
 */
export function validateTrmFormat(content: string): { ok: boolean; error?: string } {
  const s = content.replace(/\s+/g, '');
  if (s.length < 256) {
    return { ok: false, error: 'Archivo demasiado corto (no llega a 256 chars)' };
  }
  const H1 = s.substring(0, 128);
  const H2 = s.substring(128, 256);
  const C  = s.substring(256);

  if (!/^[0-9a-f]+$/.test(H1)) {
    return { ok: false, error: 'H1 no es hexadecimal válido' };
  }
  if (!/^[0-9a-f]+$/.test(H2)) {
    return { ok: false, error: 'H2 no es hexadecimal válido' };
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(C)) {
    return { ok: false, error: 'C no es base64 válido' };
  }
  // C decodificado debe tener longitud múltiplo de 16 (bloque AES)
  try {
    const decoded = CryptoJS.enc.Base64.parse(C);
    const bytes = decoded.sigBytes;
    if (bytes % 16 !== 0) {
      return { ok: false, error: `Ciphertext no es múltiplo de 16 (es ${bytes})` };
    }
  } catch (e: any) {
    return { ok: false, error: `No se pudo decodificar base64: ${e.message}` };
  }
  return { ok: true };
}

// =====================================================================
// DESCIFRADO CAPA 1 (archivo completo)
// =====================================================================

/**
 * Descifra el contenido de un archivo .trm y devuelve el JSON plano.
 *
 * @param trmContent  contenido del .trm como string (puede tener o no saltos)
 */
export function decryptTrmFile(trmContent: string): DecryptionResult {
  try {
    const validation = validateTrmFormat(trmContent);
    if (!validation.ok) return validation as DecryptionResult;

    const s = trmContent.replace(/\s+/g, '');
    const H1 = s.substring(0, 128);
    const H2 = s.substring(128, 256);
    const C  = s.substring(256);

    // Clave AES = SHA-256( H1 como ASCII )
    const plaintext = aesEcbDecrypt(C, H1);

    // Verificación: SHA-512(plaintext) == H2
    const actualH2 = sha512Hex(plaintext);
    if (actualH2 !== H2) {
      return {
        ok: false,
        error: `Verificación SHA-512 fallida. Esperado: ${H2}, actual: ${actualH2}`,
      };
    }

    const data = JSON.parse(plaintext) as TransfermovilBackup;
    return { ok: true, data, rawJson: plaintext };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}

// =====================================================================
// DESCIFRADO CAPA 2 (campos sensibles)
// =====================================================================

/**
 * Descifra un campo individual cifrado con la constante CV.
 * Úsalo para: CuentaBanco.cuenta, MCBank.cuenta, Nauta.cuenta, etc.
 *
 * @param ciphertextB64  valor del campo (base64)
 * @returns plaintext o null si no se pudo descifrar
 */
export function decryptAccount(ciphertextB64: string): string | null {
  try {
    if (!ciphertextB64 || typeof ciphertextB64 !== 'string') return null;
    if (ciphertextB64.length < 16) return null;
    if (!/^[A-Za-z0-9+/=]+$/.test(ciphertextB64)) return null;
    return aesEcbDecrypt(ciphertextB64, CV_HARDCODED);
  } catch {
    return null;
  }
}

/** Campos que sabemos que están cifrados con CV_HARDCODED */
const ENCRYPTED_FIELDS = new Set([
  'cuenta',
  'cuenta_old',
  'cuentaOld',
  'password',
  'pass',
  'pin',
  'clave',
  'tarjeta',
  'numero_tarjeta',
]);

/**
 * Recorre recursivamente el JSON descifrado y descifra todos los campos
 * sensibles in-place. Añade un campo `<nombre>_descifrado` con el valor plano.
 *
 * Nota: las cuentas Nauta suelen estar en claro en el JSON (texto plano,
 * sin cifrar). Si el campo ya contiene un valor no-base64, se deja como está.
 */
export function decryptAllFields(data: TransfermovilBackup): TransfermovilBackup {
  function walk(obj: any): any {
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (ENCRYPTED_FIELDS.has(k) && typeof v === 'string' && v.length >= 16) {
          // Solo intentar descifrar si parece base64 (no es texto plano)
          const looksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(v);
          if (looksLikeBase64) {
            const decrypted = decryptAccount(v);
            out[k] = decrypted ?? v;
            if (decrypted) out[`${k}_descifrado`] = decrypted;
          } else {
            // Ya está en claro (caso típico de Nauta)
            out[k] = v;
            out[`${k}_descifrado`] = v;
          }
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return obj;
  }
  return walk(data) as TransfermovilBackup;
}

// =====================================================================
// PIPELINE COMPLETO
// =====================================================================

/**
 * Pipeline completo: lee .trm -> descifra capa 1 -> descifra capa 2.
 * Devuelve los datos listos para usar en la billetera web.
 */
export function processTrmBackup(trmContent: string): DecryptionResult {
  const layer1 = decryptTrmFile(trmContent);
  if (!layer1.ok || !layer1.data) return layer1;

  layer1.data = decryptAllFields(layer1.data);
  return layer1;
}

// =====================================================================
// HELPERS para mapear a modelo de billetera
// =====================================================================

/**
 * Busca una tabla por nombre en el backup descifrado.
 */
export function getTable(backup: TransfermovilBackup, name: string): TransfermovilTable | undefined {
  return backup.datos.find(t => t.tabla === name);
}

/**
 * Devuelve todas las cuentas bancarias (CuentaBanco + MCBank + Nauta)
 * ya descifradas, en un formato unificado.
 */
export function getAllAccounts(backup: TransfermovilBackup): Array<{
  source: 'CuentaBanco' | 'MCBank' | 'Nauta';
  id: number;
  descripcion?: string;
  accountNumber: string;
  movil?: string;
  tipo_cuenta?: number;
}> {
  const result: any[] = [];
  for (const source of ['CuentaBanco', 'MCBank', 'Nauta'] as const) {
    const table = getTable(backup, source);
    if (!table) continue;
    for (const row of table.dataJSON) {
      result.push({
        source,
        id: row.id,
        descripcion: row.descripcion,
        accountNumber: row.cuenta_descifrado || row.cuenta,
        movil: row.movil,
        tipo_cuenta: row.tipo_cuenta,
      });
    }
  }
  return result;
}

/**
 * Devuelve todas las transacciones (RecordSMS) parseadas.
 * Convierte la fecha string de Java ("Jul 4, 2026 7:28:50 AM") a Date.
 */
export function getAllTransactions(backup: TransfermovilBackup): Array<{
  id: number;
  date: Date;
  amount: number;
  currency: string;
  service: string;
  serviceType: string;
  transactionId: string;
  visible: boolean;
  raw: Record<string, any>;
}> {
  const table = getTable(backup, 'RecordSMS');
  if (!table) return [];
  return table.dataJSON.map(row => ({
    id: row.id,
    date: parseJavaDate(row.fecha),
    amount: parseFloat(row.monto) || 0,
    currency: row.moneda,
    service: row.servicio,
    serviceType: row.tipo_servicio,
    transactionId: row.idTransaccion,
    visible: row.mostrar !== false,
    raw: row,
  }));
}

/**
 * Parsea una fecha en formato Java Date.toString()
 * Ejemplo: "Jul 4, 2026 7:28:50 AM" -> Date
 */
export function parseJavaDate(s: string): Date {
  if (!s) return new Date(NaN);
  const m = s.match(/^(\w{3})\s+(\d+),\s+(\d{4})\s+(\d+):(\d+):(\d+)\s+(AM|PM)$/);
  if (!m) return new Date(s);  // fallback

  const [_, monthAbbr, day, year, hour, min, sec, ampm] = m;
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
    May: '05', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const mm = months[monthAbbr] || '01';
  let hh = parseInt(hour, 10);
  if (ampm === 'PM' && hh !== 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;

  const iso = `${year}-${mm}-${day.padStart(2, '0')}T${String(hh).padStart(2, '0')}:${min}:${sec}`;
  return new Date(iso);
}

// =====================================================================
// TESTS BÁSICOS (descomentar para ejecutar con: ts-node transfermovil.ts)
// =====================================================================

/*
if (require.main === module) {
  // Test de la constante CV
  const expectedKey = 'f4f3ec1310696ec5977636cfacf181d322ea7d5ea9650430a97abff920fd17d2';
  const actualKey = sha256Bytes(CV_HARDCODED).toString(CryptoJS.enc.Hex);
  console.assert(actualKey === expectedKey, `Clave AES incorrecta: ${actualKey}`);
  console.log('✓ Clave AES derivada correctamente');

  // Test de descifrado de cuenta (test vector)
  const testCiphertext = 'NsauAIGRxUWfs5AOIqJHcJQhUU/7EjbIuUYni9c18rM=';
  const expectedAccount = '9224069993966692';
  const actualAccount = decryptAccount(testCiphertext);
  console.assert(actualAccount === expectedAccount, `Cuenta mal descifrada: ${actualAccount}`);
  console.log('✓ Test vector de cuenta OK');

  console.log('\nTodos los tests pasaron.');
}
*/
