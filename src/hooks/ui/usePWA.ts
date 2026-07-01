'use client';
import { logger } from '@/lib/logger';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Update UI notify the user they can install the PWA
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Appinstalled event
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      logger.info('DATABASE', 'PWA_WAS_INSTALLED')
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      // Show the install prompt
      deferredPrompt.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      logger.info('DATABASE', `User response to the install prompt: ${outcome}`);

      // We've used the prompt, and can't use it again, throw it away
      setDeferredPrompt(null);
      setIsInstallable(false);
      return outcome === 'accepted';
    } catch (error) {
      console.error('Error during PWA installation:', error);
      return false;
    }
  }, [deferredPrompt]);

  return { isInstallable, installApp };
}
