'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Smartphone, MessageCircle, Users, Upload } from 'lucide-react';
import { useAuthStore } from '@/store';

// Lazy-load las sub-vistas existentes para preservar el bundle splitting
const WhatsAppDashboardView = React.lazy(() => import('./WhatsAppDashboardView'));
const WhatsAppConfigView = React.lazy(() => import('./WhatsAppConfigView'));
const WhatsAppConversationsView = React.lazy(() => import('./WhatsAppConversationsView'));
const WhatsAppGroupView = React.lazy(() => import('./WhatsAppGroupView'));
const WhatsAppInvitationsView = React.lazy(() => import('./WhatsAppInvitationsView'));

/**
 * WhatsAppHubView (2026-07-04)
 *
 * Vista unificada que contiene todas las sub-vistas de WhatsApp en tabs:
 *   - Dashboard
 *   - Conexión y Config
 *   - Conversaciones
 *   - Grupo de Ventas
 *   - Invitaciones
 *
 * Antes cada sub-vivía como item separado en el sidebar (5 items). Ahora
 * el sidebar solo tiene "WhatsApp" bajo "Redes Sociales" y esta vista
 * gestiona la navegación interna via tabs.
 *
 * El tab activo se persiste en localStorage para que el usuario vuelva
 * al último tab que usó. Default: 'dashboard'.
 */
const WHATSAPP_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'config', label: 'Conexión y Config', icon: Smartphone },
  { id: 'conversations', label: 'Conversaciones', icon: MessageCircle },
  { id: 'group', label: 'Grupo de Ventas', icon: Users },
  { id: 'invitations', label: 'Invitaciones', icon: Upload },
] as const;

type WhatsAppTab = typeof WHATSAPP_TABS[number]['id'];

const STORAGE_KEY = 'whatsapp-hub-active-tab';

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

export default function WhatsAppHubView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<WhatsAppTab>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return WHATSAPP_TABS.some(t => t.id === saved) ? (saved as WhatsAppTab) : 'dashboard';
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value as WhatsAppTab);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  };

  if (!user?.activeStoreId) {
    return (
      <div className="p-6 sm:p-8 text-center">
        <Smartphone className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-sm font-black uppercase tracking-widest mb-2">Sin tienda activa</h3>
        <p className="text-xs text-muted-foreground">
          Selecciona una tienda en el selector superior para gestionar WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-foreground flex items-center gap-2">
          <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
          WhatsApp
        </h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Conecta WhatsApp por tienda, responde consultas con IA y gestiona grupo de ventas.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 mb-6 h-auto">
          {WHATSAPP_TABS.map(tab => {
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
          <LazyWrapper><WhatsAppDashboardView /></LazyWrapper>
        </TabsContent>
        <TabsContent value="config" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><WhatsAppConfigView /></LazyWrapper>
        </TabsContent>
        <TabsContent value="conversations" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><WhatsAppConversationsView /></LazyWrapper>
        </TabsContent>
        <TabsContent value="group" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><WhatsAppGroupView /></LazyWrapper>
        </TabsContent>
        <TabsContent value="invitations" className="mt-0 focus-visible:outline-none">
          <LazyWrapper><WhatsAppInvitationsView /></LazyWrapper>
        </TabsContent>
      </Tabs>
    </div>
  );
}
