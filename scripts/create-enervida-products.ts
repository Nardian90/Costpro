import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STORE_ID = process.env.ENERVIDA_STORE_ID || '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Categorías creadas
const CATEGORIES = {
  'Kits Solares': 'd242eafe-9751-4c2d-8210-0a98bc5c48a5',
  'Inversores': 'ab33cc5e-a8c2-402c-a3d8-33b3b88c30a2',
  'Sistemas Integrados': '32088cbe-50c2-49b0-838f-124f2c460ee3',
  'Accesorios': '363f898d-ac80-4122-a345-fd0e12790cd4',
  'Protección': 'abb98b43-e559-46b5-9a6e-6ce67fb33d9e',
};

const IMG_BASE = `${SUPABASE_URL}/storage/v1/object/public/product-images`;

interface ProductDef {
  name: string;
  description: string;
  price: number;
  priceCurrency: string;
  category: string;
  imageNum: number;
}

const products: ProductDef[] = [
  {
    name: 'Conectores MC4',
    description: 'Conectores MC4 diseñados para conectar paneles fotovoltaicos en sistemas de energía solar. Su función principal es asegurar conexiones eléctricas seguras y estables entre paneles, evitando desconexiones accidentales y resistiendo condiciones climáticas adversas. Caso de uso: instalación de sistemas solares fotovoltaicos, donde se requieren conexiones estancas y confiables entre paneles en serie o paralelo.',
    price: 5,
    priceCurrency: 'USD',
    category: 'Accesorios',
    imageNum: 1,
  },
  {
    name: 'Protector sobretensiones SPD corriente continua (GZ-C40)',
    description: 'Dispositivo de protección contra sobretensiones (SPD) modelo GZ-C40, diseñado para proteger sistemas de corriente continua (DC) de daños por picos de voltaje. Su función principal es desviar el exceso de energía a tierra, protegiendo inversores y paneles solares. Caso de uso: sistemas fotovoltaicos donde se requiere proteger el equipo contra rayos o fluctuaciones de la red.',
    price: 30,
    priceCurrency: 'USD',
    category: 'Protección',
    imageNum: 2,
  },
  {
    name: 'Protector sobretensiones PEMZZ T2 fotovoltaico',
    description: 'Dispositivo de protección contra sobretensiones (SPD) de la marca PEMZZ, tipo T2, diseñado específicamente para sistemas de energía solar fotovoltaica (marcado con DC+ y DC-). Protege contra sobretensiones transitorias y descargas atmosféricas. Caso de uso: protección de circuitos DC en instalaciones solares residenciales y comerciales.',
    price: 30,
    priceCurrency: 'USD',
    category: 'Protección',
    imageNum: 3,
  },
  {
    name: 'Disyuntor trifásico 3 polos 80A 400V (DZ47-125 D80)',
    description: 'Interruptor automático (disyuntor) de 3 polos modelo DZ47-125 D80, diseñado para proteger circuitos eléctricos trifásicos de sobrecargas y cortocircuitos. Con capacidad nominal de 80 Amperios y tensión de 400V. Caso de uso: protección de circuitos principales en instalaciones industriales o comerciales que requieren manejo de cargas trifásicas elevadas.',
    price: 10000,
    priceCurrency: 'CUP',
    category: 'Protección',
    imageNum: 4,
  },
  {
    name: 'Kit Solar 3.6Kw (inversor + 2 baterías 12V 200AMP + 3 paneles) con montaje',
    description: 'Kit solar completo de 3.6 kW que incluye inversor, dos baterías de 12V 200AMP y tres paneles solares, con montaje incluido. Sirve para generar energía limpia a partir de la luz solar, almacenarla en baterías y convertirla en electricidad utilizable para alimentar electrodomésticos, sistemas de iluminación y equipos de pequeña a mediana potencia. Caso de uso: hogar o negocio que busca independencia energética parcial o total, con instalación profesional incluida.',
    price: 2800,
    priceCurrency: 'USD',
    category: 'Kits Solares',
    imageNum: 5,
  },
  {
    name: 'Interruptor transferencia automática (ATS) automático/manual',
    description: 'Interruptor automático de transferencia (ATS) con modo de operación automática y manual, diseñado para conmutar entre dos fuentes de alimentación (normal y de respaldo) garantizando continuidad del servicio eléctrico. Caso de uso: sistemas con generador de respaldo o baterías, donde se requiere cambio automático sin interrupción cuando falla la red principal.',
    price: 85,
    priceCurrency: 'USD',
    category: 'Protección',
    imageNum: 6,
  },
  {
    name: 'ATS doble potencia 2 polos (ciudad + generador)',
    description: 'Interruptor automático de transferencia de fuentes (ATS) de doble potencia de dos polos, diseñado para gestionar el cambio entre fuente de energía de ciudad y un generador. Su función principal es asegurar que la carga siempre tenga energía, cambiando automáticamente a la fuente disponible. Caso de uso: instalaciones con generador de respaldo que requieren conmutación automática entre red eléctrica y generador.',
    price: 65,
    priceCurrency: 'USD',
    category: 'Protección',
    imageNum: 7,
  },
  {
    name: 'Inversor 12KW',
    description: 'Inversor de 12 kW que convierte la energía solar de corriente continua (CC) a corriente alterna (CA) para alimentar dispositivos y sistemas eléctricos en hogares y negocios. Diseño inteligente con pantalla digital para monitoreo en tiempo real. Caso de uso: sistema solar residencial o comercial de alta capacidad que requiere convertir la energía de paneles solares o baterías en electricidad utilizable para electrodomésticos, aires acondicionados y equipos de oficina.',
    price: 2750,
    priceCurrency: 'USD',
    category: 'Inversores',
    imageNum: 8,
  },
  {
    name: 'Inversor 12KW + 2 baterías 5KW',
    description: 'Sistema de energía solar híbrido compuesto por un inversor de 12 kW y dos baterías de 5 kW cada una, diseñado para generar, almacenar y gestionar electricidad de forma autónoma. El inversor convierte la energía solar en electricidad utilizable mientras las baterías almacenan el exceso para uso nocturno o emergencias. Caso de uso: hogar o negocio que necesita respaldo energético completo con almacenamiento, ideal para zonas con cortes frecuentes o para máxima independencia de la red.',
    price: 5000,
    priceCurrency: 'USD',
    category: 'Inversores',
    imageNum: 9,
  },
  {
    name: 'Portafusible fotovoltaico DC 1000V (RT18-32 ZENEOGX)',
    description: 'Interruptor termomagnético (disyuntor) de la marca ZENEOGX, modelo RT18-32, diseñado para proteger circuitos eléctricos de sobrecargas y cortocircuitos en sistemas solares de corriente continua (DC) de hasta 1000V. Funciona desconectando el circuito cuando detecta una corriente superior a la nominal. Caso de uso: protección de strings de paneles fotovoltaicos en instalaciones solares residenciales y comerciales.',
    price: 20,
    priceCurrency: 'USD',
    category: 'Protección',
    imageNum: 11,
  },
  {
    name: 'Protector voltaje/corriente ajustable riel DIN',
    description: 'Protector digital de sobrecorriente y sobretensión ajustable, diseñado para monitorear y proteger sistemas eléctricos de daños por exceso de voltaje o corriente. Se monta en riel DIN y permite configurar umbrales de protección. Sirve para detectar anomalías y cortar la alimentación antes de que los electrodomésticos sufran daños. Caso de uso: protección de electrodomésticos costosos (neveras, aires acondicionados, televisores) contra fluctuaciones del voltaje de la red eléctrica.',
    price: 30,
    priceCurrency: 'USD',
    category: 'Protección',
    imageNum: 12,
  },
  {
    name: 'Sistema integrado Must 2KW',
    description: 'Sistema integrado de almacenamiento de energía marca MUST de 2 kW, diseñado para proveer electricidad confiable y estable. Su función principal es almacenar energía (de la red o de paneles solares) y suministrarla cuando sea necesario, funcionando como respaldo (UPS) o como sistema autónomo. Caso de uso: hogar o pequeña oficina que necesita respaldo energético para equipos esenciales (iluminación, nevera, router, ventiladores) durante cortes eléctricos, con capacidad de 2 kW.',
    price: 1550,
    priceCurrency: 'USD',
    category: 'Sistemas Integrados',
    imageNum: 13,
  },
];

async function main() {
  let success = 0;
  let failed = 0;

  for (const p of products) {
    const imageUrl = `${IMG_BASE}/enervida_${p.imageNum}.jpg`;
    const categoryId = CATEGORIES[p.category as keyof typeof CATEGORIES];

    const { data, error } = await admin.from('products').insert({
      name: p.name,
      description: p.description,
      price: p.price,
      price_currency: p.priceCurrency,
      store_id: STORE_ID,
      category: p.category,
      category_id: categoryId,
      image_url: imageUrl,
      public_image_url: imageUrl,
      unit_of_measure: 'unidad',
      stock_current: 0,
      min_stock: 0,
      is_active: true,
      visible_en_tienda: true,
      sku: `ENV-${String(p.imageNum).padStart(3, '0')}`,
      status: 'ACTIVE',
      is_complete: true,
    }).select();

    if (error) {
      console.error(`❌ ${p.name}: ${error.message}`);
      failed++;
    } else {
      console.log(`✅ ${p.name} — ${p.price} ${p.priceCurrency}`);
      success++;
    }
  }

  console.log(`\n=== RESULTADO: ${success} productos creados, ${failed} fallidos ===`);
}

main().catch(console.error);
