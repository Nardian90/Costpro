/**
 * Loading state for the public storefront.
 * Shows a construction-themed skeleton while the store data loads.
 */
export default function StorefrontLoading() {
  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header skeleton */}
      <div className="bg-gradient-to-br from-amber-900 via-stone-800 to-stone-900">
        <div className="h-1 bg-amber-500" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 animate-pulse" />
            <div className="space-y-3 flex-1">
              <div className="h-8 sm:h-10 w-64 bg-white/10 rounded-lg animate-pulse" />
              <div className="h-4 w-48 bg-white/5 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
        <div className="bg-black/20 border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
            <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Toolbar skeleton */}
      <div className="sticky top-0 z-40 bg-white/95 border-b border-stone-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="h-11 w-full bg-stone-100 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl border-2 border-stone-200 bg-white overflow-hidden">
              <div className="aspect-[4/3] bg-stone-100 animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-5 w-3/4 bg-stone-100 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-stone-50 rounded animate-pulse" />
                <div className="h-3 w-full bg-stone-50 rounded animate-pulse" />
                <div className="flex justify-between items-end pt-3 border-t-2 border-stone-100">
                  <div className="space-y-1">
                    <div className="h-2 w-12 bg-stone-50 rounded animate-pulse" />
                    <div className="h-6 w-24 bg-amber-100 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Screen reader announcement */}
      <span className="sr-only" role="status">Cargando productos de la tienda...</span>
    </div>
  );
}
