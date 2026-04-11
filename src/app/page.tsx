'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SplashScreen from '@/components/SplashScreen';
import WelcomeLandingView from '@/components/auth/WelcomeLandingView';
import LoginForm from '@/components/auth/LoginForm';
import { X } from 'lucide-react';
import { CostProLogo } from '@/components/CostProLogo';

export default function HomePage() {
  const [showSplash, setShowSplash] = useState(true);
  const [showLoginForm, setShowLoginForm] = useState(false);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <div className="relative min-h-screen">
      <WelcomeLandingView onLoginClick={() => setShowLoginForm(true)} />

      <AnimatePresence>
        {showLoginForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/40 backdrop-blur-md"
          >
            <div
              className="absolute inset-0"
              onClick={() => setShowLoginForm(false)}
            />

            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="relative w-full max-w-md z-[110]"
            >
              <button
                onClick={() => setShowLoginForm(false)}
                className="absolute -top-4 -right-4 md:top-4 md:right-4 z-[120] w-11 h-11 flex items-center justify-center bg-background border border-border rounded-full shadow-xl text-muted-foreground hover:text-foreground hover:scale-110 active:scale-95 transition-all"
                aria-label="Cerrar login"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="mb-8 flex justify-center">
                <CostProLogo size={60} animated={false} />
              </div>

              <LoginForm />

              <p className="text-center text-xs font-bold text-muted-foreground mt-8 uppercase tracking-[0.2em]">
                Acceso Protegido por Encriptación de Grado Bancario
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
