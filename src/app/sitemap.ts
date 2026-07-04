import type { MetadataRoute } from 'next';

/**
 * Sitemap.xml — CostPro
 *
 * Lista todas las páginas públicas indexables.
 * Las rutas de API y panel de administración se excluyen (requieren auth).
 *
 * Las vitrinas públicas (/tienda/[slug]) se incluyen dinámicamente
 * consultando Supabase, pero para evitar latencia en el build,
 * se incluyen las tiendas conocidas estáticamente.
 */
export default function sitemap(): MetadataRoute.Sitemap {
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
  ];

  return staticPages;
}
