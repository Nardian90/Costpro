/**
 * Dedicated layout for the public storefront.
 *
 * Forces light mode so the storefront always looks correct regardless
 * of the admin's theme preference. Also isolates the storefront from
 * unnecessary app providers (SyncProvider, CookieConsent, etc.).
 */
import { headers } from 'next/headers';

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // FIX-CSP: Read the nonce injected by middleware.ts so inline scripts pass CSP
  const headersList = await headers();
  const nonce = headersList.get('x-csp-nonce') || '';

  return (
    <>
      {/* Force light theme: remove 'dark' class and suppress dark variants */}
      <script
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              try {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
              } catch(e) {}
            })();
          `,
        }}
      />
      {/* Storefront-specific keyframe animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes construccionShimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      ` }} />
      {/* Scoped wrapper with explicit light-mode overrides */}
      <div
        className="tienda-root"
        style={{
          colorScheme: 'light',
          background: '#fafaf9',
          color: '#1c1917',
        }}
      >
        {children}
      </div>
    </>
  );
}
