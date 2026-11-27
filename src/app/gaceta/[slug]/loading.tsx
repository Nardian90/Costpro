/**
 * ADNEGOCIO-GACETA-EDITORIAL-UX-001 — estado de carga del artículo.
 * Skeleton editorial de lectura.
 */
export default function LoadingGacetaArticulo() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Cargando la nota de El Diario Contable…</span>

      <header className="border-b-[3px] border-foreground/85">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="h-6 w-44 animate-pulse rounded-sm bg-muted" />
          <div className="h-9 w-44 animate-pulse rounded-sm bg-muted" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="h-3 w-40 animate-pulse rounded-sm bg-muted" />
        <div className="mt-4 h-10 w-full animate-pulse rounded-sm bg-muted" />
        <div className="mt-2 h-10 w-5/6 animate-pulse rounded-sm bg-muted" />
        <div className="mt-4 h-4 w-full animate-pulse rounded-sm bg-muted" />
        <div className="mt-2 h-4 w-11/12 animate-pulse rounded-sm bg-muted" />
        <div className="mt-6 h-10 w-full animate-pulse rounded-sm bg-muted" />
        <div className="mt-7 space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded-sm bg-muted" />
          ))}
          <div className="h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
        </div>
      </main>
    </div>
  );
}
