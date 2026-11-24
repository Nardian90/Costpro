import { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabaseClient';

/**
 * EL DIARIO CONTABLE (ADN-011) — portada pública del periódico.
 *
 * Sección pública estilo periódico para usuarios contadores y MIPymes de
 * Cuba. El editor automático (scheduler) publica a diario sobre la Gaceta
 * Oficial; cuando no hay novedades oficiales, publica una nota de CostPro.
 *
 * Lectura EXCLUSIVAMENTE vía la vista pública public_gaceta_v (CP-SEC-027:
 * anon no tiene acceso directo a la tabla gaceta_posts).
 */

export const revalidate = 600; // las ediciones son diarias; 10 min de frescura

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://costpro4.vercel.app';

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
  return new Intl.DateTimeFormat('es-CU', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat('es-CU', { day: '2-digit', month: 'short' }).format(d);
}

export async function generateMetadata(): Promise<Metadata> {
  const title = 'El Diario Contable — Gaceta Oficial y novedades para MIPymes, a diario';
  const description =
    'Publicación diaria de ADNegocio para contadores y MIPymes cubanas: lo que sale en la Gaceta Oficial, explicado en lenguaje claro. Sin novedades oficiales, novedades de CostPro.';
  const url = `${SITE_URL}/gaceta`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'CostPro',
      locale: 'es_ES',
      type: 'website',
    },
    robots: { index: true, follow: true },
  };
}

async function fetchEdiciones(): Promise<GacetaPostCard[]> {
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
    return [];
  }
}

function EtiquetaChip({ etiqueta, tipo }: { etiqueta: string; tipo: string }) {
  const esGaceta = tipo === 'gaceta';
  return (
    <span
      className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
        esGaceta
          ? 'bg-red-900/10 text-red-900 dark:bg-red-400/10 dark:text-red-300'
          : 'bg-emerald-900/10 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-300'
      }`}
    >
      {etiqueta}
    </span>
  );
}

function TarjetaNota({ nota, compacta = false }: { nota: GacetaPostCard; compacta?: boolean }) {
  const esGaceta = nota.tipo === 'gaceta';
  return (
    <article className="border-b border-border pb-6">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`text-[10px] font-black uppercase tracking-[0.2em] ${
            esGaceta ? 'text-red-800 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-400'
          }`}
        >
          {esGaceta ? 'Gaceta Oficial' : 'CostPro'}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">· {fechaCorta(nota.fecha)}</span>
        {nota.etiquetas.slice(0, 2).map((e) => (
          <EtiquetaChip key={e} etiqueta={e} tipo={nota.tipo} />
        ))}
      </div>
      <h3 className={`font-[family-name:var(--font-editorial)] leading-tight tracking-tight ${compacta ? 'text-lg' : 'text-xl'}`}>
        <Link href={`/gaceta/${nota.slug}`} className="hover:underline underline-offset-4">
          {nota.titular}
        </Link>
      </h3>
      {nota.bajada ? (
        <p className={`mt-1.5 text-muted-foreground ${compacta ? 'text-sm leading-snug' : 'text-[15px] leading-relaxed'}`}>
          {nota.bajada}
        </p>
      ) : null}
      <Link
        href={`/gaceta/${nota.slug}`}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-foreground/70 hover:text-foreground"
      >
        Leer la nota →
      </Link>
    </article>
  );
}

export default async function GacetaPortadaPage() {
  const ediciones = await fetchEdiciones();

  const hoy = new Intl.DateTimeFormat('es-CU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const [principal, ...resto] = ediciones;
  const gacetaResto = resto.filter((n) => n.tipo === 'gaceta').slice(0, 6);
  const costproResto = resto.filter((n) => n.tipo === 'costpro').slice(0, 4);
  const archivo = ediciones.slice(1, 12);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'El Diario Contable',
    url: `${SITE_URL}/gaceta`,
    inLanguage: 'es',
    publisher: { '@type': 'Organization', name: 'ADNegocio' },
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
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/<\/script/gi, '<\\/script') }}
      />

      {/* Cabina del periódico */}
      <header className="border-b-4 border-double border-foreground/80">
        <div className="mx-auto max-w-3xl px-4 pt-8 pb-5 text-center sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            Una publicación diaria de ADNegocio
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-editorial)] text-4xl font-black uppercase tracking-tight sm:text-5xl">
            El Diario Contable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            La Gaceta Oficial, explicada en lenguaje claro para contadores y MIPymes de Cuba
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-y border-border py-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <span className="capitalize">{hoy}</span>
            <span aria-hidden>·</span>
            <span>Edición No. {ediciones.length || 1}</span>
            <span aria-hidden>·</span>
            <span>Aparece todos los días</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {ediciones.length === 0 ? (
          <section className="border border-dashed border-border p-8 text-center">
            <h2 className="font-[family-name:var(--font-editorial)] text-2xl">Edición en preparación</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              La redacción está revisando la Gaceta Oficial de hoy. La primera edición aparece en breve: cada día
              publicamos lo que corresponde saber a contadores y MIPymes, y si no hay novedades oficiales, trae
              novedades de CostPro.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block border border-foreground/70 px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background"
            >
              Conocer CostPro
            </Link>
          </section>
        ) : (
          <>
            {/* Nota principal de la portada */}
            {principal ? (
              <section className="mb-10 border-b border-border pb-8">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                      principal.tipo === 'gaceta' ? 'text-red-800 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-400'
                    }`}
                  >
                    {principal.tipo === 'gaceta' ? 'Gaceta Oficial de Cuba' : 'Novedades CostPro'}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    · {fechaLarga(principal.fecha)}
                  </span>
                  {principal.destacado ? (
                    <span className="bg-foreground px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-background">
                      Portada
                    </span>
                  ) : null}
                </div>
                <h2 className="font-[family-name:var(--font-editorial)] text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                  <Link href={`/gaceta/${principal.slug}`} className="hover:underline underline-offset-4">
                    {principal.titular}
                  </Link>
                </h2>
                {principal.bajada ? (
                  <p className="mt-3 font-[family-name:var(--font-editorial)] text-lg leading-relaxed text-foreground/80">{principal.bajada}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {principal.etiquetas.map((e) => (
                    <EtiquetaChip key={e} etiqueta={e} tipo={principal.tipo} />
                  ))}
                </div>
                <Link
                  href={`/gaceta/${principal.slug}`}
                  className="mt-4 inline-block border border-foreground/70 px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background"
                >
                  Leer la edición de hoy
                </Link>
              </section>
            ) : null}

            {/* Secciones */}
            <div className="grid gap-10 sm:grid-cols-2">
              <section>
                <h2 className="mb-4 border-b-2 border-foreground/80 pb-1 font-[family-name:var(--font-editorial)] text-xl font-black uppercase tracking-tight">
                  Gaceta Oficial
                </h2>
                <div className="space-y-6">
                  {gacetaResto.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Hoy la redacción sigue la pista a las resoluciones oficiales publicadas.
                    </p>
                  ) : (
                    gacetaResto.map((n) => <TarjetaNota key={n.id} nota={n} compacta />)
                  )}
                </div>
              </section>
              <section>
                <h2 className="mb-4 border-b-2 border-foreground/80 pb-1 font-[family-name:var(--font-editorial)] text-xl font-black uppercase tracking-tight">
                  Novedades CostPro
                </h2>
                <div className="space-y-6">
                  {costproResto.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Novedades, tips y mejoras de la plataforma de costos para MIPymes.
                    </p>
                  ) : (
                    costproResto.map((n) => <TarjetaNota key={n.id} nota={n} compacta />)
                  )}
                </div>
                <Link
                  href="/"
                  className="mt-4 inline-block text-xs font-semibold uppercase tracking-widest text-foreground/70 hover:text-foreground"
                >
                  Probar CostPro →
                </Link>
              </section>
            </div>

            {/* Archivo de la semana */}
            {archivo.length > 0 ? (
              <section className="mt-12 border-t-4 border-double border-foreground/80 pt-6">
                <h2 className="mb-4 font-[family-name:var(--font-editorial)] text-xl font-black uppercase tracking-tight">Ediciones recientes</h2>
                <ul className="divide-y divide-border">
                  {archivo.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                      <span className="w-20 shrink-0 text-xs uppercase tracking-widest text-muted-foreground">
                        {fechaCorta(n.fecha)}
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest ${
                          n.tipo === 'gaceta' ? 'text-red-800 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-400'
                        }`}
                      >
                        {n.tipo === 'gaceta' ? 'GO' : 'CP'}
                      </span>
                      <Link href={`/gaceta/${n.slug}`} className="text-sm hover:underline underline-offset-4">
                        {n.titular}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-8 text-center sm:px-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            El Diario Contable es una publicación de ADNegocio, impulsada por{' '}
            <Link href="/" className="font-semibold underline underline-offset-4">
              CostPro
            </Link>
            , la plataforma de costos y gestión para MIPymes cubanas. Fuentes: Gaceta Oficial de la República de Cuba
            y normativa vigente; el contenido es informativo y no sustituye la consulta oficial.
          </p>
          <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Se publica a diario · Redactado con asistencia de IA y revisión editorial
          </p>
        </div>
      </footer>
    </div>
  );
}
