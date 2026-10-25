// Verificación READ-ONLY/SIN-ESCRITURA de que la cadena de migraciones de caja
// está VIVA en producción. Sondas con entrada INVÁLIDA: las funciones elevan
// excepción de validación ANTES de cualquier escritura.
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
const BASE = /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
const KEY = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)?.[1]?.trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const probe = async (name, fn, args, expectErr) => {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: H, body: JSON.stringify(args),
  });
  const body = await r.text();
  const pgrst202 = r.status === 404 && body.includes('PGRST202'); // función no existe
  const validationErr = r.status >= 400 && !pgrst202 && (expectErr.test(body) || body.includes('ERR_'));
  console.log(`${pgrst202 ? '❌ NO EXISTE (migración ausente)' : validationErr ? '✅ EXISTE y valida (sin escritura)' : '⚠️ ' + r.status} — ${name}`);
  if (!pgrst202 && !validationErr) console.log('   ', body.slice(0, 160));
};

// register_cash_adjustment (NUEVO en 20261026000000) — dirección inválida ⇒ ERR_INVALID_DIRECTION antes de escribir
await probe('register_cash_adjustment (nuevo en 20261026000000)', 'register_cash_adjustment',
  { p_store_id: '5e6fe821-5465-48b1-b3f1-3aa3182edc38', p_direction: 'xx', p_amount: 1, p_note: 'probe' },
  /ERR_INVALID_DIRECTION|ERR_FORBIDDEN_ROLE|ERR_UNAUTHORIZED/);

// pay_commission (NUEVO en 20261026000000) — payment id nulo ⇒ error de validación antes de escribir
await probe('pay_commission (nuevo en 20261026000000)', 'pay_commission',
  { p_payment_id: null, p_payment_method: 'cash' },
  /ERR_|payment/);
