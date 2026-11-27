/**
 * ADNEGOCIO-GACETA-EDITORIAL-UX-001 — estado de carga de la portada.
 * Skeleton editorial (mismo esqueleto visual que la portada real).
 * El layout #gaceta-root persiste, así que hereda los tokens del tema.
 */
export default function LoadingGacetaPortada() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Cargando la edición de El Diario Contable…</span>

      <header className="border-b-[3px] border-foreground/85">
        <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
          <div className="h-3 w-40 animate-pulse rounded-sm bg-muted" />
          <div className="mt-6 pb-6 text-center">
            <div className="mx-auto h-3 w-56 animate-pulse rounded-sm bg-muted" />
            <div className="mx-auto mt-4 h-12 w-72 animate-pulse rounded-sm bg-muted sm:w-96" />
            <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded-sm bg-muted sm:w-80" />
          </div>
          <div className="flex items-center justify-between border-t border-border py-2.5">
            <div className="h-3 w-28 animate-pulse rounded-sm bg-muted" />
            <div className="h-9 w-44 animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-10 border-b border-border pb-8">
          <div className="h-3 w-48 animate-pulse rounded-sm bg-muted" />
          <div className="mt-4 h-9 w-full animate-pulse rounded-sm bg-muted" />
          <div className="mt-2 h-9 w-4/5 animate-pulse rounded-sm bg-muted" />
          <div className="mt-4 h-4 w-full animate-pulse rounded-sm bg-muted" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
          <div className="mt-5 h-10 w-44 animate-pulse rounded-sm bg-muted" />
        </div>
        <div className="grid gap-10 sm:grid-cols-2">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-6">
              <div className="h-6 w-40 animate-pulse rounded-sm bg-muted" />
              {[0, 1].map((i) => (
                <div key={i} className="border-b border-border pb-6">
                  <div className="h-3 w-36 animate-pulse rounded-sm bg-muted" />
                  <div className="mt-2 h-5 w-full animate-pulse rounded-sm bg-muted" />
                  <div className="mt-2 h-3 w-3/4 animate-pulse rounded-sm bg-muted" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
