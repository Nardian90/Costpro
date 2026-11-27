import type { MetadataRoute } from 'next';
import { createServerClient } from '@/lib/supabaseClient';

/**
 * Sitemap.xml — ADNegocio
 *
 * Lista todas las páginas públicas indexables.
 * Las rutas de API y panel de administración se excluyen (requieren auth).
 *
 * ADNEGOCIO-GACETA-EDITORIAL-UX-001: las notas del Diario Contable
 * (/gaceta/[slug]) se agregan dinámicamente desde la vista pública
 * public_gaceta_v (misma superficie anon que las páginas). Ante error de
 * lectura, el sitemap se sirve con las páginas estáticas (fail-open seguro).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://costpro4.vercel.app';

  // Páginas estáticas principales
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/tienda/enervida-vitallcons`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/tienda/puerto-padre-vitallcons`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      // ADN-011: periódico público — se actualiza a diario
      url: `${baseUrl}/gaceta`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  // ADNEGOCIO-GACETA-EDITORIAL-UX-001 — notas publicadas del Diario Contable
  const gacetaNotas: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('public_gaceta_v')
      .select('fecha, slug')
      .order('fecha', { ascending: false })
      .limit(200);
    if (error) throw error;
    for (const nota of data || []) {
      gacetaNotas.push({
        url: `${baseUrl}/gaceta/${nota.slug}`,
        lastModified: new Date(`${nota.fecha}T12:00:00`),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  } catch (e) {
    console.warn('[Sitemap] public_gaceta_v no disponible; se omite el archivo de la gaceta', e);
  }

  return [...staticPages, ...gacetaNotas];
}
