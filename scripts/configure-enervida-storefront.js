#!/usr/bin/env node
/**
 * Sube el banner y 3 imágenes promocionales a Supabase Storage
 * y actualiza el store ENERVIDA-VITALLCONS con:
 *   - banner_url
 *   - promo_images[] (3 elementos)
 *   - services[] (3 servicios)
 *   - store_tagline
 *   - opening_hours
 */
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno
require('dotenv').config({ path: '/home/z/my-project/.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
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

  // URL pública
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/stores/${storagePath}`;
  console.log(`  ✅ Subido. URL pública: ${publicUrl}`);
  return publicUrl;
}

async function updateStore(payload) {
  console.log(`\n▶ Actualizando store ${STORE_ID}...`);
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
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const data = await res.json();
  console.log('✅ Store actualizado correctamente.');
  return data;
}

(async () => {
  try {
    // ── 1. Subir banner ──
    console.log('\n═══ Subiendo banner ═══');
    const bannerUrl = await uploadImage(
      path.join(IMAGES_DIR, 'banner-enervida.png'),
      `enervida-banner-${Date.now()}.png`,
      'store-banners'
    );

    // ── 2. Subir 3 imágenes promocionales ──
    console.log('\n═══ Subiendo imágenes promocionales ═══');
    const promo1Url = await uploadImage(
      path.join(IMAGES_DIR, 'promo1-instalacion.png'),
      `enervida-promo1-${Date.now()}.png`,
      'store-promo-images'
    );
    const promo2Url = await uploadImage(
      path.join(IMAGES_DIR, 'promo2-mantenimiento.png'),
      `enervida-promo2-${Date.now()}.png`,
      'store-promo-images'
    );
    const promo3Url = await uploadImage(
      path.join(IMAGES_DIR, 'promo3-piezas.png'),
      `enervida-promo3-${Date.now()}.png`,
      'store-promo-images'
    );

    // ── 3. Construir payload con servicios, tagline y horario ──
    const payload = {
      banner_url: bannerUrl,
      store_tagline: 'Energía solar fotovoltaica, mantenimiento y piezas de respuesto en toda Cuba',
      opening_hours: 'Lun-Vie 8:30-17:00, Sáb 8:30-12:30',
      services: [
        {
          icon: 'wrench',
          title: 'Instalación',
          description: 'Instalación profesional de sistemas fotovoltaicos, inversores y baterías. Proyectos residenciales y comerciales.',
        },
        {
          icon: 'shield',
          title: 'Mantenimiento',
          description: 'Mantenimiento preventivo y correctivo de sistemas solares. Limpieza de paneles, revisión de inversores y diagnóstico de baterías.',
        },
        {
          icon: 'package',
          title: 'Piezas de respuesto',
          description: 'Comercialización de conectores MC4, portafusibles, protectores sobretensiones, ATS, disyuntores y accesorios fotovoltaicos.',
        },
      ],
      promo_images: [
        {
          url: promo1Url,
          caption: 'Instalación profesional de paneles solares',
          link: null,
        },
        {
          url: promo2Url,
          caption: 'Mantenimiento de inversores y baterías',
          link: null,
        },
        {
          url: promo3Url,
          caption: 'Piezas de respuesto en existencia',
          link: null,
        },
      ],
    };

    // ── 4. Actualizar store ──
    await updateStore(payload);

    console.log('\n═══ RESUMEN ═══');
    console.log(`Banner:        ${bannerUrl}`);
    console.log(`Promo 1:       ${promo1Url}`);
    console.log(`Promo 2:       ${promo2Url}`);
    console.log(`Promo 3:       ${promo3Url}`);
    console.log(`Servicios:     3 (Instalación, Mantenimiento, Piezas de respuesto)`);
    console.log(`Tagline:       ${payload.store_tagline}`);
    console.log(`Horario:       ${payload.opening_hours}`);

    console.log('\n✅ TODO OK. Visita: https://preview-zai-bot.space-z.ai/tienda/enervida-vitallcons');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
