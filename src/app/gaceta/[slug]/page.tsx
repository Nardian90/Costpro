import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabaseClient';
import { ShareButton } from './ShareButton';
import { GacetaThemeToggle } from '../GacetaThemeToggle';

/**
 * EL DIARIO CONTABLE (ADN-011) — página del artículo.
 *
 * ADNEGOCIO-GACETA-EDITORIAL-UX-001: lectura prolongada con voz serif,
 * drop cap, bloque de fuente oficial con advertencia editorial, tema propio
 * de la gaceta y marca ADNegocio. Renderiza el bloque `cuerpo` (jsonb):
 * h2 / p / li / quote / dato. Lectura EXCLUSIVAMENTE vía public_gaceta_v
 * (CP-SEC-027).
 */

export const revalidate = 600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://costpro4.vercel.app';
const TZ_EDICTION = 'America/Havana';

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
  return new Intl.DateTimeFormat('es-CU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ_EDICTION,
  }).format(d);
}

function fuenteLabel(tipo: string, extendido = false): { texto: string; clase: string } {
  return tipo === 'gaceta'
    ? {
        texto: extendido ? 'Gaceta Oficial de Cuba' : 'Gaceta Oficial',
        clase: 'gaceta-oficial',
      }
    : {
        texto: extendido ? 'Novedades de ADNegocio' : 'ADNegocio',
        clase: 'gaceta-plataforma',
      };
}

/**
 * Etiquetas (chips) normalizadas para PRESENTACIÓN: la etiqueta histórica de
 * marca guardada en la base («CostPro») se muestra con el nombre vigente
 * (ADNegocio). Solo afecta al render: los datos de public_gaceta_v no se
 * alteran (alcance de la misión: cero escrituras a la base de datos).
 */
function etiquetaVisible(etiqueta: string): string {
  return etiqueta.trim().toLowerCase() === 'costpro' ? 'ADNegocio' : etiqueta;
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
  const description =
    art.bajada ||
    'Nota de El Diario Contable, la publicación diaria de ADNegocio para contadores y MIPymes de Cuba.';
  const imagen = `${SITE_URL}/gaceta-og.png`;
  return {
    title: `${art.titular} — El Diario Contable`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: art.titular,
      description,
      url,
      siteName: 'ADNegocio',
      locale: 'es_ES',
      type: 'article',
      publishedTime: art.fecha,
      authors: ['ADNegocio'],
      images: [{ url: imagen, width: 1200, height: 630, alt: 'El Diario Contable — una publicación de ADNegocio' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: art.titular,
      description,
      images: [imagen],
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
          <h2 key={i} className="gaceta-serif mt-9 mb-2 text-[1.45rem] font-bold leading-snug tracking-tight">
            {texto}
          </h2>
        );
        break;
      case 'quote':
        cerrarLista(`li-${i}`);
        render.push(
          <blockquote
            key={i}
            className="gaceta-serif my-6 border-l-4 border-foreground/50 pl-5 text-xl italic leading-relaxed"
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
            className="my-5 border-y-[3px] border-double border-foreground/60 py-3 text-center text-sm font-bold uppercase tracking-wide"
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
          <p key={i} className={i === 0 ? 'gaceta-dropcap' : undefined}>
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
  const fuente = fuenteLabel(art.tipo, true);
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
    dateModified: art.fecha,
    inLanguage: 'es',
    isAccessibleForFree: true,
    author: { '@type': 'Organization', name: 'ADNegocio', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'ADNegocio',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.svg` },
    },
    image: [`${SITE_URL}/gaceta-og.png`],
    mainEntityOfPage: `${SITE_URL}/gaceta/${art.slug}`,
    ...(art.fuente ? { citation: art.fuente } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/<\/script/gi, '<\\/script') }}
      />

      <header className="border-b-[3px] border-foreground/85">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <Link
              href="/gaceta"
              className="gaceta-serif whitespace-nowrap text-xl font-black uppercase tracking-tight hover:underline underline-offset-4"
            >
              El Diario Contable
            </Link>
            <span className="hidden text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:inline">
              Una publicación de <span className="gaceta-plataforma">ADNegocio</span>
            </span>
          </div>
          <div className="ml-auto">
            <GacetaThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <article>
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${fuente.clase}`}>{fuente.texto}</span>
            <span className="gaceta-kicker text-[10px] font-semibold uppercase tracking-widest">
              <span aria-hidden="true">· </span>
              <time dateTime={art.fecha}>{fechaLarga(art.fecha)}</time>
            </span>
          </div>

          <h1 className="gaceta-serif gaceta-balance text-[2rem] font-bold leading-[1.14] tracking-tight sm:text-[2.55rem]">
            {art.titular}
          </h1>
          {art.bajada ? (
            <p className="gaceta-serif mt-4 text-lg leading-relaxed text-foreground/75 sm:text-xl">{art.bajada}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
            <div className="flex flex-wrap gap-1.5">
              {art.etiquetas.map((e) => (
                <span
                  key={e}
                  className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    esGaceta ? 'gaceta-oficial-chip' : 'gaceta-plataforma-chip'
                  }`}
                >
                  {etiquetaVisible(e)}
                </span>
              ))}
            </div>
            <ShareButton titulo={art.titular} />
          </div>

          <div className="gaceta-cuerpo gaceta-serif mt-7 text-[17px] sm:text-[18px]">
            {bloques.length > 0 ? (
              <CuerpoArticulo bloques={bloques} />
            ) : (
              <p className="text-muted-foreground">Esta nota se publicó sin cuerpo adicional.</p>
            )}
          </div>

          {art.fuente ? (
            <div className="mt-9 border-t border-border pt-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Fuente oficial</p>
              <a
                href={art.fuente}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block break-all underline underline-offset-4"
              >
                {art.fuente}
              </a>
              {esGaceta ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Esta nota es una interpretación editorial con fines informativos: consulta siempre el documento
                  oficial antes de tomar decisiones.
                </p>
              ) : null}
            </div>
          ) : null}
        </article>

        {/* CTA editorial */}
        <aside className="my-10 border-y-4 border-double border-foreground/70 py-6 text-center">
          <h2 className="gaceta-serif text-xl font-black uppercase tracking-tight">
            Llevar la gestión del negocio al día, sin dolor
          </h2>
          <p className="gaceta-serif mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            ADNegocio es la plataforma de gestión para MIPymes cubanas: finanzas con partida doble, inventario,
            ventas y fichas de costo Res. 148/2023 en un solo lugar.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex min-h-[40px] items-center border-2 border-foreground px-5 text-xs font-bold uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background"
          >
            Conocer ADNegocio
          </Link>
        </aside>

        {relacionadas.length > 0 ? (
          <section aria-labelledby="sec-sigue-leyendo" className="mb-10">
            <h2
              id="sec-sigue-leyendo"
              className="gaceta-serif mb-3 border-b-2 border-foreground/80 pb-1.5 text-lg font-black uppercase tracking-tight"
            >
              Sigue leyendo
            </h2>
            <ul className="divide-y divide-border">
              {relacionadas.map((r) => (
                <li key={r.id} className="py-3">
                  <Link
                    href={`/gaceta/${r.slug}`}
                    className="gaceta-serif text-sm font-bold hover:underline underline-offset-4"
                  >
                    {r.titular}
                  </Link>
                  <span className="gaceta-kicker ml-2 text-xs">{fechaLarga(r.fecha)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-6 text-center sm:px-6">
          <Link
            href="/gaceta"
            className="inline-flex min-h-[36px] items-center text-xs font-bold uppercase tracking-widest hover:underline underline-offset-4"
          >
            <span aria-hidden="true">← </span> Volver a la portada
          </Link>
          <p className="gaceta-kicker mt-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
            El Diario Contable · Una publicación de ADNegocio
          </p>
        </div>
      </footer>
    </>
  );
}
