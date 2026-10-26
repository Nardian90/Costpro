/**
 * exchange-rates-capture.ts — Entrada del cron de captura de tasas.
 *
 * AUTOMATIZACIÓN (misión IC-DIVIZA 2026-10-26): Vercel Hobby solo permite 1
 * cron (ocupado por purge-snapshots), por eso la captura diaria se recuperó
 * como workflow programado de GitHub Actions que ejecuta ESTE script.
 *
 * MISMA LÓGICA COMPARTIDA: importa `captureDateRange` de src/lib/exchange-capture.ts
 * — exactamente la misma lib que usan /api/exchange-rates/refresh (proxy
 * manual) y /api/exchange-rates/scrape-diviza (captura informal puntual).
 * No hay una segunda implementación del adaptador.
 *
 * Qué captura (days=1, HOY):
 *   - BCC oficial: 3 segmentos × USD/EUR vía api.bc.gob.cu.
 *   - Informal: USD/EUR/MLC desde Diviza (cubadivisas.com) con source='Diviza',
 *     capture_method='real'. Si Diviza falla, NO persiste nada (carry-forward
 *     en la capa de consulta; el histórico queda intacto).
 *
 * Env requeridos (secrets del workflow):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso: npx tsx scripts/cron/exchange-rates-capture.ts [--days=1]
 * Código de salida: 0 si capturó algo; 1 si capturas=0 (para alertas CI).
 */
import { captureDateRange } from '../../src/lib/exchange-capture';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[cron-exchange-rates] Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const argDays = process.argv.find(a => a.startsWith('--days='));
  const days = Math.min(Math.max(parseInt(argDays?.split('=')[1] || '1', 10) || 1, 1), 30);

  console.log(`[cron-exchange-rates] Capturando últimos ${days} día(s): BCC + informal (Diviza)...`);
  const started = Date.now();

  const result = await captureDateRange(days, supabaseUrl, serviceKey, 3);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[cron-exchange-rates] Completado en ${elapsed}s`);
  // IC-DIVIZA-002: fecha operativa (civil de Cuba) que gobernó la captura.
  console.log(`  fecha operativa (Cuba): ${result.operativeDate}`);
  console.log(`  fechas procesadas: ${result.datesProcessed.length}`);
  console.log(`  registros capturados: ${result.captured.length}`);
  const bySource = result.captured.reduce<Record<string, number>>((acc, c) => {
    acc[c.source] = (acc[c.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  por fuente: ${JSON.stringify(bySource)}`);
  // Estado independiente por fuente (misión §4): un BCC correcto no oculta
  // un fallo de Diviza y viceversa.
  console.log(
    `  BCC: ok=${result.bcc.ok} filas=${result.bcc.rows} errores=${result.bcc.errors.length}`,
  );
  console.log(
    `  Diviza: ok=${result.diviza.ok} filas=${result.diviza.rows} ` +
      `fuenteActualizada=${result.divizaSourceUpdatedAt ?? '—'} errores=${result.diviza.errors.length}`,
  );
  if (result.errors.length > 0) {
    console.warn(`  errores (${result.errors.length}):`);
    for (const e of result.errors.slice(0, 10)) console.warn(`    - ${e}`);
  }

  // Resumen visible para el summary del workflow.
  const fs = await import('fs');
  const informal = result.captured.filter(c => c.source === 'Diviza');
  const summary = [
    `### Captura de tasas — ${new Date().toISOString().slice(0, 19)}Z`,
    '',
    `- Fecha operativa (Cuba): **${result.operativeDate}**`,
    `- Fechas procesadas: **${result.datesProcessed.length}**`,
    `- Registros capturados: **${result.captured.length}**`,
    `- Informal Diviza (real): **${informal.length}** filas ` +
      `(${informal.map(i => `${i.currency}=${i.rate}`).join(', ') || 'sin captura'})`,
    `- BCC oficial: **${result.captured.filter(c => c.source === 'BCC').length}** filas`,
    `- Estado BCC: **${result.bcc.ok ? 'OK' : 'CON ERRORES'}** · ` +
      `Estado Diviza: **${result.diviza.ok ? 'OK' : 'FALLIDO'}**` +
      `${result.bcc.ok !== result.diviza.ok ? ' · ÉXITO PARCIAL' : ''}`,
    `- Errores: **${result.errors.length}**`,
    '',
  ].join('\n');
  try {
    fs.writeFileSync(process.env.GITHUB_STEP_SUMMARY ?? '/dev/null', summary);
  } catch {
    /* fuera de GH Actions: ignorar */
  }

  // Fail-visible: 0 capturas en el día → exit 1 (el workflow alerta).
  if (result.captured.length === 0) {
    console.error('[cron-exchange-rates] CERO capturas — revisa conectividad/proveedor.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[cron-exchange-rates] Error fatal:', err);
  process.exit(1);
});
