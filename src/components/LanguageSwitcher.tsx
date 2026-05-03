'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useLocaleContext, setLocaleCookie } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const t = useTranslations('languageSwitcher');
  const currentLocale = useLocale();
  const { setLocale } = useLocaleContext();

  const handleLocaleChange = (newLocale: 'es' | 'en') => {
    setLocaleCookie(newLocale);
    setLocale(newLocale);
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('label')}
          className="gap-1.5 text-xs"
        >
          <Globe className="h-4 w-4" />
          <span>{currentLocale === 'es' ? 'ES' : 'EN'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleLocaleChange('es')}
          className={currentLocale === 'es' ? 'bg-accent' : ''}
        >
          {t('spanish')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleLocaleChange('en')}
          className={currentLocale === 'en' ? 'bg-accent' : ''}
        >
          {t('english')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
