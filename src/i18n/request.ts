import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = (cookieStore.get('NEXT_LOCALE')?.value as Locale) || defaultLocale;

  if (!locales.includes(locale)) {
    return {
      locale: defaultLocale,
      messages: (await import(`../messages/${defaultLocale}.json`)).default,
    };
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
