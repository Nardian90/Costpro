/**
 * Final parity test: build the Telegram caption text (what Telegram would
 * send) and compare it to what the rendered JPG shows (visually verified
 * by VLM). This proves "Telegram → Vitrina → Exporter" all agree.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import {
  buildTelegramProductMessage,
  getProductPresentation,
} from '../src/lib/storefront/product-presentation.ts';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: products } = await client
    .from('products')
    .select('*')
    .eq('store_id', ENERVIDA_STORE_ID)
    .eq('is_active', true)
    .eq('visible_en_tienda', true)
    .order('name')
    .limit(5);

  console.log('=== Telegram caption vs JPG content (parity check) ===\n');

  const captions = [];
  for (const p of products || []) {
    const caption = buildTelegramProductMessage(p, {
      showPrice: 'according_to_storefront',
      showPhysicalUnits: false,  // matches the modal's telegramOptions default
    });
    const presentation = getProductPresentation(p);

    console.log('---', p.name, '---');
    console.log('Caption text (what Telegram would send):');
    console.log(caption.text);
    console.log('Presentation:');
    console.log(`  priceVisible: ${presentation.priceVisible}`);
    console.log(`  formattedPrice: ${presentation.formattedPrice}`);
    console.log(`  stockVisible: ${presentation.stockVisible}`);
    console.log(`  stockQuantity: ${presentation.stockQuantity}`);
    console.log('');

    captions.push({ id: p.id, name: p.name, caption: caption.text });
  }

  writeFileSync(
    '/home/z/my-project/download/telegram-captions-parity.json',
    JSON.stringify(captions, null, 2),
  );
  console.log('\nCaptions written to /home/z/my-project/download/telegram-captions-parity.json');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
