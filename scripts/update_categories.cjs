// Actualizar categorías existentes en la BD para que coincidan con el servicio
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // Obtener todas las transacciones con su servicio
  const { data: txs, error } = await admin.from('wallet_transactions')
    .select('id, service, category, manual_category');

  if (error) { console.log('Error:', error.message); return; }
  console.log(`Total transacciones: ${txs.length}`);

  let updated = 0;
  for (const tx of txs) {
    // Solo actualizar si no tiene manual_category (respetar override del usuario)
    if (tx.manual_category) continue;
    const newCategory = tx.service || 'Otros';
    // Forzar actualización siempre (la categoría vieja no coincide con servicio)
    const { error: e } = await admin.from('wallet_transactions')
      .update({ category: newCategory })
      .eq('id', tx.id);
    if (!e) updated++;
  }
  console.log(`✅ Actualizadas: ${updated} transacciones`);

  // Verificar
  const { data: sample } = await admin.from('wallet_transactions')
    .select('service, category, operation, amount')
    .limit(10);
  console.log('\nSample después de update:');
  sample.forEach(t => console.log(`  ${t.service} | cat: ${t.category} | ${t.operation} | ${t.amount}`));
}

main().catch(e => { console.error(e); process.exit(1); });
