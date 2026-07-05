#!/usr/bin/env node
/**
 * Sube 2 nuevas imágenes promocionales (sin personas) y actualiza el store
 * ENERVIDA-VITALLCONS para reemplazar promo1 y promo2.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '/home/z/my-project/.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const IMAGES_DIR = '/home/z/my-project/scripts/tmp-images';

async function uploadImage(filePath, fileName, folder) {
  const fileBuffer = fs.readFileSync(filePath);
  const storagePath = `${folder}/${fileName}`;
  console.log(`  ▶ Subiendo ${filePath} → ${storagePath} (${fileBuffer.length} bytes)`);
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/stores/${storagePath}`,
    {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: fileBuffer,
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/stores/${storagePath}`;
  console.log(`  ✅ Subido: ${publicUrl}`);
  return publicUrl;
}

(async () => {
  // 1. Subir las 2 imágenes nuevas
  console.log('═══ Subiendo nuevas imágenes promocionales (sin personas) ═══');
  const promo1Url = await uploadImage(
    path.join(IMAGES_DIR, 'promo1-instalacion-v2.png'),
    `enervida-promo1-v2-${Date.now()}.png`,
    'store-promo-images'
  );
  const promo2Url = await uploadImage(
    path.join(IMAGES_DIR, 'promo2-mantenimiento-v2.png'),
    `enervida-promo2-v2-${Date.now()}.png`,
    'store-promo-images'
  );

  // 2. Construir nuevo array promo_images reemplazando solo 1 y 2
  // (mantener promo3 que ya está bien)
  const newPromoImages = [
    {
      url: promo1Url,
      caption: 'Paneles solares de alta eficiencia',
      link: null,
    },
    {
      url: promo2Url,
      caption: 'Inversores y baterías de litio',
      link: null,
    },
    // promo3 (piezas) se conserva
    {
      url: 'https://wthkddeleylijmonclxg.supabase.co/storage/v1/object/public/stores/store-promo-images/enervida-promo3-1783144851443.png',
      caption: 'Piezas de respuesto en existencia',
      link: null,
    },
  ];

  // 3. PATCH store
  console.log('\n═══ Actualizando store con nuevas imágenes ═══');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/stores?id=eq.${STORE_ID}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ promo_images: newPromoImages }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  console.log('✅ Store actualizado. Nuevas 3 imágenes promocionales:');
  newPromoImages.forEach((p, i) => console.log(`  ${i + 1}. ${p.caption} → ${p.url.split('/').pop()}`));
})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
