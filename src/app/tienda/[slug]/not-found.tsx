import Link from 'next/link';
import { Package } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function StorefrontNotFound() {
  const t = await getTranslations('stores.storefront');

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Construction-style 404 */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-amber-500/10 border-2 border-amber-500/20 mb-6">
            <Package className="w-12 h-12 text-amber-500/60" />
          </div>
          <h1 className="text-6xl font-black text-stone-900 tracking-tighter">404</h1>
          <div className="h-1 w-16 bg-amber-500 mx-auto mt-3 mb-4" />
          <h2 className="text-xl font-black uppercase tracking-tight text-stone-700">
            {t('errorTitle')}
          </h2>
        </div>

        <p className="text-sm text-stone-500 mb-8 leading-relaxed">
          {t('errorDescription')}
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-stone-900 text-white text-xs font-black uppercase tracking-widest hover:bg-stone-800 transition-colors"
        >
          {t('errorGoBack')}
        </Link>
      </div>
    </div>
  );
}
