// PROOF: the idempotency hash is NOT deterministic when p_operation_date IS NULL
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/pgtest/');
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5435/cajamision' });
await c.connect();
const r1 = await c.query(`SELECT COALESCE(NULL::timestamptz, 'now')::text AS t`);
await new Promise(res => setTimeout(res, 50));
const r2 = await c.query(`SELECT COALESCE(NULL::timestamptz, 'now')::text AS t`);
console.log('call1:', r1.rows[0].t);
console.log('call2:', r2.rows[0].t);
console.log('determinista (replay benigno posible):', r1.rows[0].t === r2.rows[0].t);
const r3 = await c.query(`SELECT md5('x|' || COALESCE(NULL::timestamptz, 'now')::text) AS h1`);
await new Promise(res => setTimeout(res, 50));
const r4 = await c.query(`SELECT md5('x|' || COALESCE(NULL::timestamptz, 'now')::text) AS h1`);
console.log('hash1:', r3.rows[0].h1, '\nhash2:', r4.rows[0].h1, '\nhash distinto ⇒ reintento de red RECHAZADO:', r3.rows[0].h1 !== r4.rows[0].h1);
await c.end();
