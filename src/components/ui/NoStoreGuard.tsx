'use client';

import { useAuthStore } from '@/store';
import { Store, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface NoStoreGuardProps {
  children: React.ReactNode;
}

/**
 * Renders children only when a store is selected.
 * Shows a prompt to select a store when activeStoreId is missing.
 */
export function NoStoreGuard({ children }: NoStoreGuardProps) {
  const { user } = useAuthStore();
  const t = useTranslations('stores');

  if (!user?.activeStoreId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Store className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">{t('selectStorePrompt')}</h2>
        <p className="text-muted-foreground max-w-md">
          {t('selectStoreDescription')}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button
            onClick={() => window.location.href = '/terminal?view=stores'}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-lg font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t('goToStores')}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <p className="text-sm text-muted-foreground">
            {t('selectStoreFromHeader')}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
