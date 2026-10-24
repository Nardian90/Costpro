#!/usr/bin/env node
/** DECISIVO 2: el mecanismo del expediente = ventana temporal `<= now()` (now() = INICIO de
 * la transacción del LECTOR). T2 empieza ANTES (t2_start < t1_start), pero adquiere el
 * advisory DESPUÉS del commit de T1. La lectura post-lock de T2 NO ve la fila de T1 porque
 * su payment_date (= t1_start) > now() de T2 (= t2_start). */
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/pgtest/');
const { Client } = require('pg');
const PG = 'postgresql://postgres:postgres@127.0.0.1:5435/cajamision';
const c = await new Client({ connectionString: PG }).connect();
await c.query(`DROP TABLE IF EXISTS public.snap6; CREATE TABLE public.snap6 (k int, amount int, payment_date timestamptz DEFAULT now())`);
// Réplica EXACTA del patrón de lectura del real: agregado con ventana `<= now()`
await c.query(`CREATE OR REPLACE FUNCTION public.snap6_bal(p int) RETURNS numeric LANGUAGE plpgsql STABLE AS $function$
DECLARE v numeric := 0;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v FROM public.snap6 WHERE k = p AND payment_date <= now();
  RETURN 5000 - v;  -- net = base 5000 − salidas (como el net del summary)
END; $function$;`);
// Réplica del writer: advisory + lectura ventana + insert con payment_date = now()
await c.query(`CREATE OR REPLACE FUNCTION public.snap6_egreso(p int, p_key int, p_amount int) RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $function$
DECLARE v_balance numeric := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(p_key);
  SELECT public.snap6_bal(p) INTO v_balance;         -- MISMA fuente que el real
  IF p_amount > v_balance + 0.005 THEN
    RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: disponible=%, egreso=%', v_balance, p_amount;
  END IF;
  INSERT INTO public.snap6 (k, amount) VALUES (p, p_amount);  -- payment_date = now() del writer
  RETURN jsonb_build_object('ok', true, 'balance_visto', v_balance);
END; $function$;`);

const KEY = 777004;
// cB EMPIEZA PRIMERO (t2_start más antiguo) pero NO toma el lock todavía
const cB = await new Client({ connectionString: PG }).connect();
await cB.query('BEGIN');
await cB.query('SELECT now(), pg_sleep(0.15)'); // t2_start ≈ ahora; duerme DENTRO de la tx
// cA: ejecuta y COMMITEA durante el sueño de cB (t1_start > t2_start)
const cA = await new Client({ connectionString: PG }).connect();
const a = await cA.query(`SELECT public.snap6_egreso($1, $2, 3000) AS r`, [1, KEY]);
console.log('cA (empezó después, lock primero):', JSON.stringify(a.rows[0].r));
// cB: AHORA toma el lock (tras el commit de cA) y valida con now() = t2_start
try {
  const b = await cB.query(`SELECT public.snap6_egreso($1, $2, 3000) AS r`, [1, KEY]);
  console.log('cB (empezó antes, lock después del commit ajeno):', JSON.stringify(b.rows[0].r));
  console.log('\n💥 MECANISMO CONFIRMADO: cB NO vio el egreso confirmado de cA (ventana <= now() con now()=inicio de cB)');
} catch (e) {
  console.log('cB rechazado correctamente:', String(e.message).split('\n')[0]);
  console.log('\n✅ cB SÍ vio el egreso de cA — mecanismo de ventana NO confirmado');
}
await cB.query('ROLLBACK');
await cA.end(); await cB.end();
await c.query(`DROP FUNCTION IF EXISTS public.snap6_egreso(int,int,int); DROP FUNCTION IF EXISTS public.snap6_bal(int); DROP TABLE public.snap6;`);
await c.end();
