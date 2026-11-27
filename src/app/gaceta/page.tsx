import { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabaseClient';
import { GacetaThemeToggle } from './GacetaThemeToggle';

/**
 * EL DIARIO CONTABLE (ADN-011) — portada pública del periódico.
 *
 * ADNEGOCIO-GACETA-EDITORIAL-UX-001: rediseño editorial con identidad de
 * periódico digital (papel marfil, filetes, voz serif), tema propio acotado
 * (claro por defecto) y marca ADNegocio. El editor automático publica a
 * diario sobre la Gaceta Oficial; cuando no hay novedades oficiales,
 * publica novedades de ADNegocio.
 *
 * Lectura EXCLUSIVAMENTE vía la vista pública public_gaceta_v (CP-SEC-027:
 * anon no tiene acceso directo a la tabla gaceta_posts).
 */

export const revalidate = 600; // las ediciones son diarias; 10 min de frescura

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://costpro4.vercel.app';

/** La publicación es cubana: todas las fechas se presentan en hora de La Habana. */
const TZ_EDICTION = 'America/Havana';

export interface GacetaPostCard {
  id: string;
  fecha: string;
  slug: string;
  tipo: string;
  titular: string;
  bajada: string | null;
  etiquetas: string[];
  destacado: boolean;
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

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat('es-CU', {
    day: '2-digit',
    month: 'short',
    timeZone: TZ_EDICTION,
  }).format(d);
}

function hoyEnLaHabana(): string {
  return new Intl.DateTimeFormat('es-CU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ_EDICTION,
  }).format(new Date());
}

/** Etiqueta de procedencia según el tipo de la nota (datos de la vista). */
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

export async function generateMetadata(): Promise<Metadata> {
  const title = 'El Diario Contable — Gaceta Oficial y novedades para MIPymes, a diario';
  const description =
    'Publicación diaria de ADNegocio para contadores y MIPymes cubanas: lo que sale en la Gaceta Oficial, explicado en lenguaje claro. Sin novedades oficiales, novedades de ADNegocio.';
  const url = `${SITE_URL}/gaceta`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'ADNegocio',
      locale: 'es_ES',
      type: 'website',
      images: [{ url: `${SITE_URL}/gaceta-og.png`, width: 1200, height: 630, alt: 'El Diario Contable — una publicación de ADNegocio' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/gaceta-og.png`],
    },
    robots: { index: true, follow: true },
  };
}

/** Devuelve null SOLO ante error de lectura (para distinguirlo de "sin publicaciones"). */
async function fetchEdiciones(): Promise<GacetaPostCard[] | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('public_gaceta_v')
      .select('id, fecha, slug, tipo, titular, bajada, etiquetas, destacado')
      .order('fecha', { ascending: false })
      .limit(60);
    if (error) throw error;
    return (data || []) as GacetaPostCard[];
  } catch (e) {
    console.warn('[Gaceta] Portada: no se pudo leer public_gaceta_v', e);
    return null;
  }
}

function EtiquetaChip({ etiqueta, tipo }: { etiqueta: string; tipo: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
        tipo === 'gaceta' ? 'gaceta-oficial-chip' : 'gaceta-plataforma-chip'
      }`}
    >
      {etiquetaVisible(etiqueta)}
    </span>
  );
}

function TarjetaNota({ nota, compacta = false }: { nota: GacetaPostCard; compacta?: boolean }) {
  const fuente = fuenteLabel(nota.tipo);
  return (
    <article className="border-b border-border pb-6">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${fuente.clase}`}>{fuente.texto}</span>
        <span className="gaceta-kicker text-[10px] font-semibold uppercase tracking-widest">
          <span aria-hidden="true">· </span>
          <time dateTime={nota.fecha}>{fechaCorta(nota.fecha)}</time>
        </span>
        {nota.etiquetas.slice(0, 2).map((e) => (
          <EtiquetaChip key={e} etiqueta={e} tipo={nota.tipo} />
        ))}
      </div>
      <h3
        className={`gaceta-serif gaceta-balance leading-tight tracking-tight ${compacta ? 'text-lg font-bold' : 'text-xl font-bold'}`}
      >
        <Link href={`/gaceta/${nota.slug}`} className="hover:underline underline-offset-4">
          {nota.titular}
        </Link>
      </h3>
      {nota.bajada ? (
        <p
          className={`gaceta-serif mt-1.5 text-muted-foreground ${
            compacta ? 'text-sm leading-snug' : 'text-[15px] leading-relaxed'
          }`}
        >
          {nota.bajada}
        </p>
      ) : null}
      <Link
        href={`/gaceta/${nota.slug}`}
        className="mt-2 inline-flex min-h-[32px] items-center gap-1 text-xs font-bold uppercase tracking-widest text-foreground/70 hover:text-foreground"
      >
        Leer la nota <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

function CabeceraPortada({ totalNotas }: { totalNotas: number }) {
  return (
    <header className="border-b-[3px] border-foreground/85">
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.25em] gaceta-kicker">
          <time className="capitalize" dateTime={new Date().toISOString().slice(0, 10)}>
            {hoyEnLaHabana()}
          </time>
          <span>Aparece todos los días</span>
        </div>

        <div className="mt-6 pb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            Una publicación de <span className="gaceta-plataforma">ADNegocio</span>
          </p>
          <h1 className="gaceta-serif gaceta-balance mt-3 text-[2.6rem] font-black uppercase leading-[1.05] tracking-tight sm:text-6xl">
            El Diario Contable
          </h1>
          <p className="gaceta-serif mt-3 text-base italic text-muted-foreground sm:text-lg">
            La Gaceta Oficial, explicada en lenguaje claro para contadores y MIPymes de Cuba
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border py-2.5">
          <span className="gaceta-kicker text-[10px] font-semibold uppercase tracking-[0.25em]">
            {totalNotas} {totalNotas === 1 ? 'nota en archivo' : 'notas en archivo'}
          </span>
          <GacetaThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default async function GacetaPortadaPage() {
  const ediciones = await fetchEdiciones();

  const hayContenido = Array.isArray(ediciones) && ediciones.length > 0;
  const [principal, ...resto] = hayContenido ? ediciones : [];
  const gacetaResto = (resto || []).filter((n) => n.tipo === 'gaceta').slice(0, 6);
  const adnResto = (resto || []).filter((n) => n.tipo !== 'gaceta').slice(0, 4);
  const archivo = hayContenido ? ediciones.slice(1, 12) : [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'El Diario Contable',
    url: `${SITE_URL}/gaceta`,
    inLanguage: 'es',
    publisher: {
      '@type': 'Organization',
      name: 'ADNegocio',
      url: SITE_URL,
    },
    ...(principal
      ? {
          mainEntity: {
            '@type': 'NewsArticle',
            headline: principal.titular,
            datePublished: principal.fecha,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/<\/script/gi, '<\\/script') }}
      />

      <CabeceraPortada totalNotas={hayContenido ? ediciones.length : 0} />

      <main id="main-content" className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {ediciones === null ? (
          <section className="border border-dashed border-border p-8 text-center" role="alert">
            <h2 className="gaceta-serif text-2xl font-bold tracking-tight">La edición no pudo cargarse</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Tuvimos un problema al consultar la redacción. Inténtalo de nuevo en unos instantes.
            </p>
            <Link
              href="/gaceta"
              className="mt-5 inline-flex min-h-[40px] items-center border-2 border-foreground px-4 text-xs font-bold uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background"
            >
              Reintentar
            </Link>
          </section>
        ) : ediciones.length === 0 ? (
          <section className="border border-dashed border-border p-8 text-center">
            <h2 className="gaceta-serif text-2xl font-bold tracking-tight">Edición en preparación</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              La redacción está revisando la Gaceta Oficial de hoy. Cada día publicamos lo que corresponde saber a
              contadores y MIPymes; si no hay novedades oficiales, traemos novedades de ADNegocio.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex min-h-[40px] items-center border-2 border-foreground px-4 text-xs font-bold uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background"
            >
              Conocer ADNegocio
            </Link>
          </section>
        ) : (
          <>
            {/* ── Nota principal de la portada ── */}
            {principal ? (
              <section aria-label="Nota principal del día" className="mb-10 border-b border-border pb-8">
                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`text-[10px] font-black uppercase tracking-[0.2em] ${fuenteLabel(principal.tipo, true).clase}`}
                  >
                    {fuenteLabel(principal.tipo, true).texto}
                  </span>
                  <span className="gaceta-kicker text-[10px] font-semibold uppercase tracking-widest">
                    <span aria-hidden="true">· </span>
                    <time dateTime={principal.fecha}>{fechaLarga(principal.fecha)}</time>
                  </span>
                  {principal.destacado ? (
                    <span className="bg-foreground px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-background">
                      Portada
                    </span>
                  ) : null}
                </div>
                <h2 className="gaceta-serif gaceta-balance text-[2.05rem] font-bold leading-[1.12] tracking-tight sm:text-[2.7rem]">
                  <Link href={`/gaceta/${principal.slug}`} className="hover:underline underline-offset-4">
                    {principal.titular}
                  </Link>
                </h2>
                {principal.bajada ? (
                  <p className="gaceta-serif mt-4 text-lg leading-relaxed text-foreground/80 sm:text-xl">
                    {principal.bajada}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {principal.etiquetas.map((e) => (
                    <EtiquetaChip key={e} etiqueta={e} tipo={principal.tipo} />
                  ))}
                </div>
                <Link
                  href={`/gaceta/${principal.slug}`}
                  className="mt-5 inline-flex min-h-[40px] items-center border-2 border-foreground px-4 text-xs font-bold uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background"
                >
                  Leer la edición de hoy
                </Link>
              </section>
            ) : null}

            {/* ── Secciones editoriales ── */}
            <div className="grid gap-10 sm:grid-cols-2">
              <section aria-labelledby="sec-gaceta-oficial">
                <h2
                  id="sec-gaceta-oficial"
                  className="gaceta-serif mb-1.5 border-b-2 border-foreground/80 pb-1.5 text-xl font-black uppercase tracking-tight"
                >
                  Gaceta Oficial
                </h2>
                <p className="gaceta-kicker mb-4 text-[10px] font-semibold uppercase tracking-[0.18em]">
                  Disposiciones oficiales · Gaceta Oficial de la República de Cuba
                </p>
                <div className="space-y-6">
                  {gacetaResto.length === 0 ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Hoy la redacción sigue la pista a las resoluciones oficiales publicadas.
                    </p>
                  ) : (
                    gacetaResto.map((n) => <TarjetaNota key={n.id} nota={n} compacta />)
                  )}
                </div>
              </section>

              <section aria-labelledby="sec-novedades-adn">
                <h2
                  id="sec-novedades-adn"
                  className="gaceta-serif mb-1.5 border-b-2 border-foreground/80 pb-1.5 text-xl font-black uppercase tracking-tight"
                >
                  Novedades de ADNegocio
                </h2>
                <p className="gaceta-kicker mb-4 text-[10px] font-semibold uppercase tracking-[0.18em]">
                  Funcionalidades, mejoras y avisos de la plataforma
                </p>
                <div className="space-y-6">
                  {adnResto.length === 0 ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Novedades, consejos y mejoras de la plataforma de gestión para MIPymes.
                    </p>
                  ) : (
                    adnResto.map((n) => <TarjetaNota key={n.id} nota={n} compacta />)
                  )}
                </div>
                <Link
                  href="/"
                  className="mt-4 inline-flex min-h-[32px] items-center text-xs font-bold uppercase tracking-widest text-foreground/70 hover:text-foreground"
                >
                  Conocer ADNegocio <span aria-hidden="true">→</span>
                </Link>
              </section>
            </div>

            {/* ── Ediciones recientes ── */}
            {archivo.length > 0 ? (
              <section aria-labelledby="sec-archivo" className="mt-12 border-t-4 border-double border-foreground/70 pt-6">
                <h2
                  id="sec-archivo"
                  className="gaceta-serif text-xl font-black uppercase tracking-tight"
                >
                  Ediciones recientes
                </h2>
                <ul className="mt-3 divide-y divide-border">
                  {archivo.map((n) => {
                    const fuente = fuenteLabel(n.tipo);
                    const sigla = n.tipo === 'gaceta' ? 'GO' : 'ADN';
                    const siglaTitulo = n.tipo === 'gaceta' ? 'Gaceta Oficial de Cuba' : 'Novedades de ADNegocio';
                    return (
                      <li key={n.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                        <time
                          dateTime={n.fecha}
                          className="gaceta-kicker w-[4.4rem] shrink-0 text-[11px] font-semibold uppercase tracking-widest"
                        >
                          {fechaCorta(n.fecha)}
                        </time>
                        <abbr
                          title={siglaTitulo}
                          className={`shrink-0 border border-border px-1 py-0.5 text-[9px] font-bold uppercase tracking-widest no-underline ${fuente.clase}`}
                        >
                          {sigla}
                        </abbr>
                        <Link href={`/gaceta/${n.slug}`} className="min-w-0 flex-1 basis-52 text-sm hover:underline underline-offset-4">
                          {n.titular}
                        </Link>
                        {n.etiquetas.slice(0, 2).map((e) => (
                          <EtiquetaChip key={e} etiqueta={e} tipo={n.tipo} />
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>

      <footer className="mt-14 border-t-[3px] border-foreground/80">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="gaceta-serif text-lg font-black uppercase tracking-tight">El Diario Contable</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Una publicación de ADNegocio
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex min-h-[36px] items-center border border-foreground/60 px-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background"
            >
              Conocer ADNegocio
            </Link>
          </div>

          <div className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              Fuentes: <strong className="font-semibold text-foreground">Gaceta Oficial de la República de Cuba</strong>{' '}
              y normativa vigente. Las notas resumen e interpretan disposiciones oficiales con fines informativos y
              didácticos; ante cualquier duda, prevalece el texto del documento oficial publicado.
            </p>
            <p className="mt-2">
              Las novedades de producto corresponden a ADNegocio, la plataforma de gestión (finanzas, inventario,
              ventas y costos) para MIPymes cubanas.
            </p>
          </div>

          <p className="gaceta-kicker mt-4 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
            Se publica a diario · Redactado con asistencia de IA y revisión editorial
          </p>
        </div>
      </footer>
    </>
  );
}
