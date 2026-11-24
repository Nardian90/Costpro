import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabaseClient';
import { ShareButton } from './ShareButton';

/**
 * EL DIARIO CONTABLE (ADN-011) — página del artículo.
 *
 * Renderiza el bloque `cuerpo` (jsonb) del Diario Contable: h2 / p / li /
 * quote / dato. Lectura EXCLUSIVAMENTE vía public_gaceta_v (CP-SEC-027).
 */

export const revalidate = 600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://costpro4.vercel.app';

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface GacetaArticulo {
  id: string;
  fecha: string;
  slug: string;
  tipo: string;
  titular: string;
  bajada: string | null;
  cuerpo: Array<{ t: string; v: string }> | null;
  etiquetas: string[];
  fuente: string | null;
}

interface PostCard {
  id: string;
  fecha: string;
  slug: string;
  tipo: string;
  titular: string;
}

function fechaLarga(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat('es-CU', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

async function fetchArticulo(slug: string): Promise<GacetaArticulo | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('public_gaceta_v')
      .select('id, fecha, slug, tipo, titular, bajada, cuerpo, etiquetas, fuente')
      .eq('slug', decodeURIComponent(slug))
      .maybeSingle();
    if (error) throw error;
    return (data as GacetaArticulo) || null;
  } catch (e) {
    console.warn('[Gaceta] Artículo: error de lectura', e);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const art = await fetchArticulo(slug);
  if (!art) {
    return { title: 'Nota no encontrada — El Diario Contable' };
  }
  const url = `${SITE_URL}/gaceta/${art.slug}`;
  const description = art.bajada || 'Nota de El Diario Contable, la publicación diaria de ADNegocio para contadores y MIPymes de Cuba.';
  return {
    title: `${art.titular} — El Diario Contable`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: art.titular,
      description,
      url,
      siteName: 'CostPro',
      locale: 'es_ES',
      type: 'article',
      publishedTime: art.fecha,
    },
    robots: { index: true, follow: true },
  };
}

/** Renderiza el cuerpo agrupando viñetas consecutivas en una lista. */
function CuerpoArticulo({ bloques }: { bloques: Array<{ t: string; v: string }> }) {
  const render: React.ReactNode[] = [];
  let listaActual: string[] = [];

  const cerrarLista = (key: string) => {
    if (listaActual.length > 0) {
      render.push(
        <ul key={key} className="my-4 list-disc space-y-1.5 pl-6">
          {listaActual.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
      listaActual = [];
    }
  };

  bloques.forEach((b, i) => {
    const texto = typeof b.v === 'string' ? b.v : '';
    switch (b.t) {
      case 'h2':
        cerrarLista(`li-${i}`);
        render.push(
          <h2
            key={i}
            className="mt-8 mb-2 border-b border-border pb-1 font-[family-name:var(--font-editorial)] text-2xl font-bold tracking-tight"
          >
            {texto}
          </h2>
        );
        break;
      case 'quote':
        cerrarLista(`li-${i}`);
        render.push(
          <blockquote
            key={i}
            className="my-5 border-l-4 border-foreground/60 bg-muted/50 py-3 pl-5 pr-4 font-[family-name:var(--font-editorial)] text-lg italic leading-relaxed"
          >
            {texto}
          </blockquote>
        );
        break;
      case 'dato':
        cerrarLista(`li-${i}`);
        render.push(
          <p
            key={i}
            className="my-4 border-y-2 border-double border-foreground/70 py-3 text-center text-sm font-bold uppercase tracking-wide"
          >
            {texto}
          </p>
        );
        break;
      case 'li':
        listaActual.push(texto);
        break;
      case 'p':
      default:
        cerrarLista(`li-${i}`);
        render.push(
          <p key={i} className="my-4 leading-relaxed">
            {texto}
          </p>
        );
        break;
    }
  });
  cerrarLista('li-final');

  return <>{render}</>;
}

export default async function GacetaArticuloPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const art = await fetchArticulo(rawSlug);
  if (!art) {
    notFound();
  }

  const esGaceta = art.tipo === 'gaceta';
  const bloques = Array.isArray(art.cuerpo) ? art.cuerpo.filter((b) => b && typeof b.v === 'string') : [];

  // Notas relacionadas (mismo tipo, fechas distintas)
  let relacionadas: PostCard[] = [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('public_gaceta_v')
      .select('id, fecha, slug, tipo, titular')
      .eq('tipo', art.tipo)
      .neq('slug', art.slug)
      .order('fecha', { ascending: false })
      .limit(3);
    relacionadas = (data || []) as PostCard[];
  } catch {
    relacionadas = [];
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: art.titular,
    datePublished: art.fecha,
    inLanguage: 'es',
    author: { '@type': 'Organization', name: 'ADNegocio' },
    publisher: { '@type': 'Organization', name: 'ADNegocio' },
    mainEntityOfPage: `${SITE_URL}/gaceta/${art.slug}`,
    ...(art.fuente ? { citation: art.fuente } : {}),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/<\/script/gi, '<\\/script') }}
      />

      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/gaceta" className="font-[family-name:var(--font-editorial)] text-lg font-black uppercase tracking-tight">
            El Diario Contable
          </Link>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">ADNegocio · Cuba</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <article>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                esGaceta ? 'text-red-800 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-400'
              }`}
            >
              {esGaceta ? 'Gaceta Oficial de Cuba' : 'Novedades CostPro'}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">· {fechaLarga(art.fecha)}</span>
          </div>

          <h1 className="font-[family-name:var(--font-editorial)] text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {art.titular}
          </h1>
          {art.bajada ? (
            <p className="mt-3 font-[family-name:var(--font-editorial)] text-lg leading-relaxed text-foreground/75">
              {art.bajada}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
            <div className="flex flex-wrap gap-1.5">
              {art.etiquetas.map((e) => (
                <span
                  key={e}
                  className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                >
                  {e}
                </span>
              ))}
            </div>
            <ShareButton titulo={art.titular} />
          </div>

          <div className="mt-6 font-[family-name:var(--font-editorial)] text-[17px] sm:text-lg">
            {bloques.length > 0 ? (
              <CuerpoArticulo bloques={bloques} />
            ) : (
              <p className="text-muted-foreground">Esta nota se publicó sin cuerpo adicional.</p>
            )}
          </div>

          {art.fuente ? (
            <div className="mt-8 border-t border-border pt-4 text-sm">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Fuente oficial: </span>
              <a
                href={art.fuente}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all underline underline-offset-4"
              >
                {art.fuente}
              </a>
            </div>
          ) : null}
        </article>

        {/* CTA editorial */}
        <aside className="my-10 border-y-4 border-double border-foreground/80 py-6 text-center">
          <h2 className="font-[family-name:var(--font-editorial)] text-xl font-black uppercase tracking-tight">
            Llevar la contabilidad al día, sin dolor
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            CostPro es la plataforma de costos, inventario y ventas que usa tu contabilidad como mapa, no como
            castigo. Hecha para MIPymes cubanas.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block border border-foreground/70 px-5 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background"
          >
            Conocer CostPro
          </Link>
        </aside>

        {relacionadas.length > 0 ? (
          <section className="mb-10">
            <h2 className="mb-3 border-b-2 border-foreground/80 pb-1 font-[family-name:var(--font-editorial)] text-lg font-black uppercase tracking-tight">
              Sigue leyendo
            </h2>
            <ul className="divide-y divide-border">
              {relacionadas.map((r) => (
                <li key={r.id} className="py-3">
                  <Link href={`/gaceta/${r.slug}`} className="text-sm font-semibold hover:underline underline-offset-4">
                    {r.titular}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{fechaLarga(r.fecha)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-6 text-center sm:px-6">
          <Link href="/gaceta" className="text-xs font-bold uppercase tracking-widest hover:underline underline-offset-4">
            ← Volver a la portada
          </Link>
        </div>
      </footer>
    </div>
  );
}
