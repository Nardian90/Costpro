'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Send, MessageCircle, Users, Upload } from 'lucide-react';
import { useAuthStore } from '@/store';

const TelegramDashboardView = React.lazy(() => import('../telegram/TelegramDashboardView'));
const TelegramConfigView = React.lazy(() => import('../telegram/TelegramConfigView'));
const TelegramConversationsView = React.lazy(() => import('../telegram/TelegramConversationsView'));
const TelegramGroupView = React.lazy(() => import('../telegram/TelegramGroupView'));
const TelegramInvitationsView = React.lazy(() => import('../telegram/TelegramInvitationsView'));

/**
 * TelegramHubView (2026-07-04)
 *
 * Vista unificada que contiene todas las sub-vistas de Telegram en tabs.
 * Mismo patrón que WhatsAppHubView. Antes cada sub-vivía como item separado
 * en el sidebar (5 items). Ahora el sidebar solo tiene "Telegram" bajo
 * "Redes Sociales" y esta vista gestiona la navegación interna via tabs.
 */
const TELEGRAM_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'config', label: 'Bot y Config', icon: Send },
  { id: 'conversations', label: 'Conversaciones', icon: MessageCircle },
  { id: 'group', label: 'Grupo de Ventas', icon: Users },
  { id: 'invitations', label: 'Invitaciones', icon: Upload },
] as const;

type TelegramTab = typeof TELEGRAM_TABS[number]['id'];

const STORAGE_KEY = 'telegram-hub-active-tab';

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      {children}
    </React.Suspense>
  );
}

export default function TelegramHubView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TelegramTab>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return TELEGRAM_TABS.some(t => t.id === saved) ? (saved as TelegramTab) : 'dashboard';
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value as TelegramTab);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  };

  if (!user?.activeStoreId) {
    return (
      <div className="p-6 sm:p-8 text-center">
        <Send className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-sm font-black uppercase tracking-widest mb-2">Sin tienda activa</h3>
        <p className="text-xs text-muted-foreground">
          Selecciona una tienda en el selector superior para gestionar Telegram.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-foreground flex items-center gap-2">
          <Send className="w-5 h-5 sm:w-6 sm:h-6 text-sky-600" />
          Telegram
        </h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Bot de Telegram por tienda, serverless-native, responde consultas con IA y gestiona grupo de ventas.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 mb-6 h-auto">
          {TELEGRAM_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-2 sm:px-4 min-h-[48px] text-[10px] sm:text-xs font-black uppercase tracking-wider"
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="leading-tight text-center">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="dashboard" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><TelegramDashboardView /></LazyWrapper>
        </TabsContent>
        <TabsContent value="config" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><TelegramConfigView /></LazyWrapper>
        </TabsContent>
        <TabsContent value="conversations" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><TelegramConversationsView /></LazyWrapper>
        </TabsContent>
        <TabsContent value="group" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><TelegramGroupView /></LazyWrapper>
        </TabsContent>
        <TabsContent value="invitations" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><TelegramInvitationsView /></LazyWrapper>
        </TabsContent>
      </Tabs>
    </div>
  );
}
