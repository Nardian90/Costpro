'use client';
import { logger } from '@/lib/logger';

import React, { useState, useEffect, useTransition, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useUIStore, ViewType } from '@/store';
import { Header } from '@/components/views/terminal/Header';
import Sidebar from '@/components/views/terminal/Sidebar';
import { ParticleBackground } from '@/components/ui/ParticleBackground';
import { useTerminalNavigation } from '@/hooks/ui/useTerminalNavigation';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchProducts } from '@/hooks/api/useProducts';
import { prefetchTransactions } from '@/hooks/api/useTransactions';
import { prefetchDashboardData } from '@/hooks/api/useDashboard';
import { prefetchAuditLogs } from '@/hooks/api/useAuditLogs';
import { prefetchReceptions } from '@/hooks/api/useReceptions';
import { useStores } from '@/hooks/api/useStores';
import { useStoreSwitcher } from '@/hooks/ui/useStoreSwitcher';
import { userService } from '@/services/user-service';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { NoStoreGuard } from '@/components/ui/NoStoreGuard';
import { useStoreDeletedMonitor } from '@/hooks/ui/useStoreDeletedMonitor';
import { useStoreInactivityMonitor } from '@/hooks/ui/useStoreInactivityMonitor'; // F3-T06
import { useRecentStores } from '@/hooks/ui/useRecentStores'; // F5-T03
import { useSwipeNavigation } from '@/hooks/ui/useSwipeNavigation'; // F5-T03
import { MobileTabBar } from '@/components/views/terminal/MobileTabBar'; // F5-T02
import ScrollToTop from '@/components/ui/ScrollToTop'; // B4
import { HelpFloatingButton } from '@/components/views/terminal/views/help/HelpFloatingButton';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';
import { getNavigationRoute } from '@/config/navigation/navigation-map';
import dynamic from 'next/dynamic';
import { useIsMobile } from '@/hooks/ui/useMobile';
import ChunkErrorBoundary from '@/components/ui/ChunkErrorBoundary';
import MobileSafeContainer from '@/components/ui/MobileSafeContainer';
import { useKeyboardShortcuts } from '@/hooks/ui/useKeyboardShortcuts';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { NavigationBreadcrumb } from '@/components/ui/NavigationBreadcrumb';

// FIX: ViewErrorBoundary defined at MODULE level — prevents unmount/remount
// on every TerminalShell re-render (was defined inside renderView, causing
// React to treat it as a new component type each time, destroying child state).
import { ErrorBoundary } from '@/components/ErrorBoundary';
function ViewErrorBoundary({ children, viewName }: { children: React.ReactNode; viewName: string }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <p className="text-destructive font-medium">Error al cargar {viewName}</p>
            <button onClick={() => window.location.reload()} className="text-sm text-primary hover:underline">
              Reintentar
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

const DashboardView = dynamic(() => import('@/components/views/terminal/views/dashboard/DashboardView'), { ssr: false });
const OCCView = dynamic(() => import('@/components/views/terminal/views/dashboard/OCCView'), { ssr: false });
const ChatBotView = dynamic(() => import('@/components/views/terminal/views/chat/ChatBotView'), { ssr: false });
const CosteoDinamicoView = dynamic(() => import('@/components/views/terminal/views/costeo_dinamico/CosteoDinamicoView'), { ssr: false });
const EstructuraCostoView = dynamic(() => import('@/components/views/terminal/views/costeo_dinamico/EstructuraCostoView'), { ssr: false });
const WhatsAppConfigView = dynamic(() => import('@/components/views/terminal/views/whatsapp/WhatsAppConfigView'), { ssr: false });
const WhatsAppConversationsView = dynamic(() => import('@/components/views/terminal/views/whatsapp/WhatsAppConversationsView'), { ssr: false });
const Pick3IntelligenceView = dynamic(() => import('@/components/views/terminal/views/pick3/Pick3IntelligenceView'), { ssr: false });
const WalletView = dynamic(() => import('@/components/views/terminal/views/wallet/WalletView'), { ssr: false });
const POSView = dynamic(() => import('@/components/views/terminal/views/pos/POSView'), { ssr: false });
const SalesHistoryView = dynamic(() => import('@/components/views/terminal/views/sales/SalesHistoryView'), { ssr: false });
const UsersManagementView = dynamic(() => import('@/components/views/terminal/views/users/UsersManagementView'), { ssr: false });
const RolesManagementView = dynamic(() => import('@/components/views/terminal/views/users/RolesManagementView'), { ssr: false });
const StoresManagementView = dynamic(() => import('@/components/views/terminal/views/stores/StoresManagementView'), { ssr: false });
const AuditGlobalView = dynamic(() => import('@/components/views/terminal/views/audit/AuditGlobalView'), { ssr: false });
const InventoryView = dynamic(() => import('@/components/views/terminal/views/inventory/InventoryView'), { ssr: false });
const CatalogView = dynamic(() => import('@/components/views/terminal/views/catalog/CatalogView'), { ssr: false });
const CostSheetView = dynamic(() => import('@/components/views/terminal/views/cost_sheet/CostSheetView'), { ssr: false });
const ReportsView = dynamic(() => import('@/components/views/terminal/views/reports/ReportsView'), { ssr: false });
const ExchangeIntelligenceView = dynamic(() => import('@/components/views/terminal/views/exchange_intelligence/ExchangeIntelligenceView'), { ssr: false });
const ReceivedServicesView = dynamic(() => import('@/components/views/terminal/views/received_services/ReceivedServicesView'), { ssr: false });
const IPVView = dynamic(() => import('@/components/views/terminal/views/ipv/IPVView'), { ssr: false });
const AcademyView = dynamic(() => import('@/components/views/terminal/views/academy/AcademyView'), { ssr: false });
const InventoryAdjustmentsView = dynamic(() => import('@/components/views/terminal/views/inventory/InventoryAdjustmentsView'), { ssr: false });
const LegalView = dynamic(() => import('@/components/views/terminal/views/legal/LegalView'), { ssr: false });
const SettingsView = dynamic(() => import('@/components/views/terminal/views/settings/SettingsView'), { ssr: false });
const HelpView = dynamic(() => import('@/components/views/terminal/views/help/HelpView'), { ssr: false });
const ProductReceptionView = dynamic(() => import('@/components/views/terminal/views/inventory/ProductReceptionView'), { ssr: false });
const TransferenciasView = dynamic(() => import('@/components/views/terminal/views/transfers/TransferenciasView'), { ssr: false });
const InventoryCountView = dynamic(() => import('@/components/views/terminal/views/inventory_count/InventoryCountView'), { ssr: false });
const CashClosureView = dynamic(() => import('@/components/views/terminal/views/cash_closure/CashClosureView'), { ssr: false });
const StockHistoryView = dynamic(() => import('@/components/views/terminal/views/stock_history/StockHistoryView'), { ssr: false });
const NewsView = dynamic(() => import('@/components/views/terminal/views/rss/NewsView'), { ssr: false });
const RSSManagementView = dynamic(() => import('@/components/views/terminal/views/rss/RSSManagementView'), { ssr: false });
const WikiView = dynamic(() => import('@/components/views/terminal/views/wiki/WikiView'), { ssr: false });
const HealthView = dynamic(() => import('@/components/views/health/HealthView'), { ssr: false });
const UsageMonitoringView = dynamic(() => import('@/components/views/terminal/views/usage_monitoring/UsageMonitoringView'), { ssr: false });
const WorkersView = dynamic(() => import('@/components/views/terminal/views/workers/WorkersView'), { ssr: false });
const ReceptionsHistoryView = dynamic(() => import('@/components/views/terminal/views/receptions/ReceptionsHistoryView'), { ssr: false });
const ProductLabelGenerator = dynamic(() => import('@/components/views/terminal/views/labels/ProductLabelGenerator'), { ssr: false });
const SalesCatalogView = dynamic(() => import('@/components/views/terminal/views/pos/SalesCatalogView'), { ssr: false });
const OfertasView = dynamic(() => import('@/components/views/terminal/views/ofertas/OfertasView'), { ssr: false });
const PurchaseOrdersView = dynamic(() => import('@/components/views/terminal/views/purchase_orders/PurchaseOrdersView'), { ssr: false });
const SalesHubView = dynamic(() => import('@/components/views/terminal/views/sales_hub/SalesHubView'), { ssr: false });
// E-SectionHub (IA Audit): SectionHubView para breadcrumbs que navegan a section hubs.
const SectionHubView = dynamic(() => import('@/components/views/terminal/views/section_hub/SectionHubView'), { ssr: false });
// E-GroupHub (IA Audit): GroupHubView para breadcrumbs que navegan a group hubs (raíz).
const GroupHubView = dynamic(() => import('@/components/views/terminal/views/section_hub/GroupHubView'), { ssr: false });

const FloatingCalculator = dynamic(() => import('@/components/ui/FloatingCalculator').then(m => m.FloatingCalculator), { ssr: false });
const ChatBot = dynamic(() => import('@/components/ui/ChatBot').then(m => m.ChatBot), { ssr: false });
const CreateProductModal = dynamic(() => import('@/components/modals/CreateProductModal').then(m => m.CreateProductModal), { ssr: false });
const CommandPalette = dynamic(() => import('@/components/ui/CommandPalette').then(m => m.CommandPalette), { ssr: false });
const SyncConflictModal = dynamic(() => import('@/components/modals/SyncConflictModal').then(m => m.SyncConflictModal), { ssr: false });

export default function TerminalShell() {
  const { user, logout, loading, status, updateUser } = useAuthStore();
  const {
    currentView,
    setCurrentView,
    setActiveCostSection,
    setIpvActiveTab,
    sidebarState,
    setSidebarState,
    toggleSidebar: globalToggleSidebar,
    isHelpReadingMode
  } = useUIStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  // Monitor if active store is deleted by another admin
  useStoreDeletedMonitor();
  // F3-T06: detectar tiendas inactivas operativamente (sin ventas/recepciones/movimientos en 30+ días)
  // Solo lo ejecuta el admin; emite notificación proactiva para sugerir pausar tiendas inactivas.
  useStoreInactivityMonitor();
  // F5-T03: trackear tiendas recientes para swipe horizontal en mobile
  const { getNextStore, getPrevStore } = useRecentStores();
  // F5-T03: swipe horizontal para cambiar entre tiendas recientes
  // Solo en mobile y en rutas operativas (no en config/admin)
  const isOperationalRoute = !['stores', 'users', 'roles', 'health', 'audit', 'settings', 'help', 'wiki', 'academy', 'legal'].includes(currentView);
  useSwipeNavigation({
    onSwipeLeft: async () => {
      const nextId = getNextStore(user?.activeStoreId);
      if (nextId && nextId !== user?.activeStoreId) {
        await switchStore(nextId);
        toast.info('Cambiando a siguiente tienda reciente');
      }
    },
    onSwipeRight: async () => {
      const prevId = getPrevStore(user?.activeStoreId);
      if (prevId && prevId !== user?.activeStoreId) {
        await switchStore(prevId);
        toast.info('Cambiando a tienda anterior');
      }
    },
    enabled: isMobile && isOperationalRoute,
  });
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const nav = useTerminalNavigation(user as any, sidebarSearch);

  useKeyboardShortcuts();

  useEffect(() => {
    const handler = () => setShowKeyboardHelp(prev => !prev);
    window.addEventListener('toggle-keyboard-help', handler);
    return () => window.removeEventListener('toggle-keyboard-help', handler);
  }, []);

  // FIX HIGH-004: Calculate isEncargado dynamically (not hardcoded false)
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager' || user?.memberships?.some(m => m.role === 'encargado');

  const { data: allStores = [] } = useStores(
    user?.id || '',
    user?.role === 'admin',
    isEncargado || false
  );

  // FIX HIGH-001: Use consolidated store switcher
  const { switchStore } = useStoreSwitcher();

  const handleLogout = async () => {
    try {
      await userService.logout();
    } catch (error: unknown) {
      logger.warn('DATABASE', '[TERMINALSHELL]_LOGOUT_ERROR_(SILENT):', { data: error })
    } finally {
      logout();
      window.location.reload();
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.reload();
      return;
    }

    if (user?.activeStoreId && status === 'authenticated_valid') {
      prefetchProducts(queryClient, user.activeStoreId);
    }
  }, [loading, user, router, queryClient, status]);

  // Role-based view guard: restrict 'costo' users to cost-related views + resources only
  const COSTO_ALLOWED_VIEWS: ViewType[] = ['cost-sheets', 'legal', 'help', 'wiki', 'academy'];
  useEffect(() => {
    if (user?.role === 'costo' && !COSTO_ALLOWED_VIEWS.includes(currentView)) {
      setCurrentView('cost-sheets');
    }
  }, [user, currentView, setCurrentView]);

  if (loading) {
    return (
      <div className="h-screen w-full bg-background">
        <ViewLoadingSplash label="COSTPRO" showTips={false} />
      </div>
    );
  }

  if (!user) return null;

  const handleViewChange = (view: ViewType) => {
    const route = getNavigationRoute(view as string);

    if (route && route.type === 'module') {
      startTransition(() => {
        setCurrentView(route.view as ViewType);
        if (route.view === 'ipv') {
          setIpvActiveTab(route.tab);
        } else if (route.view === 'cost-sheets') {
          setActiveCostSection(route.tab);
        }
      });
    } else {
      startTransition(() => {
        setCurrentView(view);
      });
    }

    if (isMobile) {
      setSidebarState('closed');
    }
  };

  const handlePrefetchView = (view: ViewType) => {
    if (!user?.activeStoreId) return;

    switch (view) {
      case 'pos':
      case 'inventory':
        prefetchProducts(queryClient, user.activeStoreId);
        break;
      case 'sales':
        prefetchTransactions(queryClient, user.activeStoreId, user.role === 'admin');
        break;
      case 'dashboard':
        prefetchDashboardData(queryClient, user.activeStoreId, user.role === 'admin');
        break;
      case 'audit':
        prefetchAuditLogs(queryClient, { storeIds: [user.activeStoreId] });
        break;
      case 'recepcion':
        prefetchReceptions(queryClient, user.activeStoreId, user.role === 'admin');
        break;
    }
  };

  const renderView = (view: ViewType) => {
    switch (view) {
        case 'dashboard': return <ViewErrorBoundary viewName="Dashboard"><DashboardView /></ViewErrorBoundary>;
        case 'pick3-intelligence': return <ViewErrorBoundary viewName="Pick3 Intelligence"><Pick3IntelligenceView /></ViewErrorBoundary>;
        case 'wallet': return <ViewErrorBoundary viewName="Wallet"><WalletView /></ViewErrorBoundary>;
        case 'pos': return <ViewErrorBoundary viewName="POS"><POSView /></ViewErrorBoundary>;
        case 'sales_catalog': return <ViewErrorBoundary viewName="Catálogo de Ventas"><SalesCatalogView /></ViewErrorBoundary>;
        case 'sales': return <ViewErrorBoundary viewName="Ventas"><SalesHistoryView /></ViewErrorBoundary>;
        case 'users': return <ViewErrorBoundary viewName="Usuarios"><UsersManagementView /></ViewErrorBoundary>;
        case 'roles': return <ViewErrorBoundary viewName="Roles"><RolesManagementView /></ViewErrorBoundary>;
        case 'stores': return <ViewErrorBoundary viewName="Tiendas"><StoresManagementView /></ViewErrorBoundary>;
        case 'audit': return <ViewErrorBoundary viewName="Auditoría"><AuditGlobalView /></ViewErrorBoundary>;
        case 'inventory': return <ViewErrorBoundary viewName="Inventario"><InventoryView /></ViewErrorBoundary>;
        case 'catalog': return <ViewErrorBoundary viewName="Catálogo"><CatalogView /></ViewErrorBoundary>;
        case 'cost-sheets': return <ViewErrorBoundary viewName="Hojas de Costo"><CostSheetView /></ViewErrorBoundary>;
        case 'reports': return <ViewErrorBoundary viewName="Reportes"><ReportsView /></ViewErrorBoundary>;
        case 'exchange-intelligence': return <ViewErrorBoundary viewName="Inteligencia Cambiaria"><ExchangeIntelligenceView /></ViewErrorBoundary>;
        case 'received-services': return <ViewErrorBoundary viewName="Servicios Recibidos"><ReceivedServicesView /></ViewErrorBoundary>;
        case 'ipv': return <ViewErrorBoundary viewName="IPV"><IPVView /></ViewErrorBoundary>;
        case 'academy': return <ViewErrorBoundary viewName="Academia"><AcademyView /></ViewErrorBoundary>;
        case 'inventory_adjustments': return <ViewErrorBoundary viewName="Ajustes de Inventario"><InventoryAdjustmentsView /></ViewErrorBoundary>;
        case 'legal': return <ViewErrorBoundary viewName="Legal"><LegalView /></ViewErrorBoundary>;
        case 'settings': return <ViewErrorBoundary viewName="Configuración"><SettingsView /></ViewErrorBoundary>;
        case 'help': return <ViewErrorBoundary viewName="Ayuda"><HelpView /></ViewErrorBoundary>;
        case 'recepcion': return <ViewErrorBoundary viewName="Recepción"><ProductReceptionView onCancel={() => setCurrentView('inventory')} /></ViewErrorBoundary>;
        case 'transferencias': return <ViewErrorBoundary viewName="Transferencias"><TransferenciasView /></ViewErrorBoundary>;
        case 'inventory_count': return <ViewErrorBoundary viewName="Conteo de Inventario"><InventoryCountView /></ViewErrorBoundary>;
        case 'cash': return <ViewErrorBoundary viewName="Cierre de Caja"><CashClosureView /></ViewErrorBoundary>;
        case 'history': return <ViewErrorBoundary viewName="Historial de Stock"><StockHistoryView /></ViewErrorBoundary>;
        case 'news': return <ViewErrorBoundary viewName="Noticias"><NewsView /></ViewErrorBoundary>;
        case 'rss_management': return <ViewErrorBoundary viewName="Gestión RSS"><RSSManagementView /></ViewErrorBoundary>;
        case 'wiki': return <ViewErrorBoundary viewName="Wiki"><WikiView /></ViewErrorBoundary>;
        case 'health': return <ViewErrorBoundary viewName="Salud del Sistema"><HealthView /></ViewErrorBoundary>;
        case 'usage-monitoring': return <ViewErrorBoundary viewName="Monitoreo de Uso"><UsageMonitoringView /></ViewErrorBoundary>;
        case 'workers': return <ViewErrorBoundary viewName="Trabajadores y Comisiones"><WorkersView /></ViewErrorBoundary>;
        case 'reception_list': return <ViewErrorBoundary viewName="Historial de Recepciones"><ReceptionsHistoryView /></ViewErrorBoundary>;
        case 'labels': return <ViewErrorBoundary viewName="Etiquetas"><ProductLabelGenerator /></ViewErrorBoundary>;
        case 'ofertas': return <ViewErrorBoundary viewName="Ofertas"><OfertasView /></ViewErrorBoundary>;
        case 'purchase-orders': return <ViewErrorBoundary viewName="Órdenes de Compra"><PurchaseOrdersView /></ViewErrorBoundary>;
        case 'sales-hub': return <ViewErrorBoundary viewName="Venta"><SalesHubView /></ViewErrorBoundary>;
        // E-GroupHub (IA Audit): group IDs como vistas válidas — renderizan GroupHubView.
        // Al hacer clic en un grupo raíz del breadcrumb (ej: "MULTI-TIENDA"), navega
        // a una vista overview con tarjetas de todos los submenus/items del grupo.
        // 'core' no está aquí porque es la home (occ).
        case 'costos':
        case 'tienda':
        case 'ipv_module':
        case 'otros':
        case 'administracion':
        case 'recursos':
          return <ViewErrorBoundary viewName="Módulo"><GroupHubView groupId={view} /></ViewErrorBoundary>;
        // E-SectionHub (IA Audit): submenu wrapper IDs ahora renderizan SectionHubView.
        // Antes: redirigían al primer hijo (confuso — el usuario perdía contexto).
        // Ahora: muestran vista overview estilo Odoo con tarjetas de todas las opciones.
        // El breadcrumb puede navegar a estos section hubs al hacer clic en un ancestro.
        // IPV y Costos submenus redirigen internamente desde SectionHubView (porque ya
        // tienen tabs internas y duplicar tarjetas sería redundante).
        case 'punto_venta':
        case 'almacen_gestion':
        case 'almacen_operaciones':
        case 'analitica':
        case 'ipv_reporting':
        case 'ipv_operaciones':
        case 'ipv_datos':
        case 'ipv_procesamiento':
        case 'ipv_avanzado':
        case 'cost_views':
        case 'cost_gen':
        case 'cost_templates':
        case 'cost_tools':
          return <ViewErrorBoundary viewName="Sección"><SectionHubView submenuId={view} /></ViewErrorBoundary>;
        case 'chat': return <ViewErrorBoundary viewName="Chat con Darian"><ChatBotView /></ViewErrorBoundary>;
        case 'costeo-dinamico': return <ViewErrorBoundary viewName="Costeo Dinámico"><CosteoDinamicoView /></ViewErrorBoundary>;
        case 'estructura-costo': return <ViewErrorBoundary viewName="Estructura de Costo"><EstructuraCostoView /></ViewErrorBoundary>;
        case 'whatsapp-config': return <ViewErrorBoundary viewName="WhatsApp Config"><WhatsAppConfigView /></ViewErrorBoundary>;
        case 'whatsapp-conversations': return <ViewErrorBoundary viewName="WhatsApp Conversaciones"><WhatsAppConversationsView /></ViewErrorBoundary>;
        case 'occ': return <ViewErrorBoundary viewName="Centro de Control"><OCCView /></ViewErrorBoundary>;
        default: {
          // E-Fix (IA Audit): default "Módulo No Disponible".
          // El breadcrumb muestra el path completo hasta la vista inexistente
          // (ej: "Inicio > ? > Módulo No Disponible") para que el usuario tenga
          // contexto de dónde está y pueda volver con el botón "Ir al Dashboard"
          // o usando el breadcrumb.
          return (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                <span className="text-2xl font-black text-muted-foreground">?</span>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-tight">Módulo No Disponible</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  La vista <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{String(view)}</code> no está implementada aún.
                </p>
                <p className="text-muted-foreground/70 text-xs max-w-md mx-auto">
                  Si llegaste aquí desde un enlace externo, es posible que la vista haya sido renombrada o eliminada. Vuelve al Dashboard para continuar.
                </p>
              </div>
              <button
                onClick={() => setCurrentView('dashboard')}
                className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity text-xs uppercase tracking-widest"
              >
                Ir al Dashboard
              </button>
            </div>
          );
        }
    }
  };

  const renderActiveView = () => {
    return <NoStoreGuard>{renderView(currentView)}</NoStoreGuard>;
  };

  const sidebarWidths = {
    'expanded': 'pl-64 lg:pl-72',
    'rail': 'pl-20',
    'closed': 'pl-0'
  };

  return (
    <div className="h-screen flex bg-background text-foreground max-w-full overflow-hidden">
      {/* Skip Navigation — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-6 focus:py-3 focus:bg-primary focus:text-primary-foreground focus:font-bold focus:rounded-xl focus:text-xs focus:uppercase focus:tracking-widest focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        Saltar al contenido
      </a>
      {/* En modo lectura de ayuda, ocultamos el Sidebar global para tener pantalla completa. */}
      {!isHelpReadingMode && (
        <Sidebar
          onViewChange={handleViewChange}
          onLogout={handleLogout}
          onClose={() => setSidebarState('closed')}
          onPrefetchView={handlePrefetchView}
        />
      )}

      <main id="main-content" className={cn(
        "flex-1 h-full flex flex-col z-10 min-w-0 transition-[padding-left,padding-right] duration-300 cubic-bezier(0.4,0,0.2,1) overflow-x-hidden overflow-y-hidden",
        !isMobile && sidebarWidths[sidebarState]
      )} role="main">
        {/* En modo lectura de ayuda, ocultamos el Header global para tener pantalla limpia. */}
        {!isHelpReadingMode && (
          <Header
            sidebarState={sidebarState}
            toggleSidebar={globalToggleSidebar}
            currentView={currentView}
            navigationItems={nav.navigationItems}
            onViewChange={handleViewChange}
            user={user as any}
            allStores={allStores}
            handleSetActiveStore={switchStore}
            onLogout={handleLogout}
          />
        )}

        {!isHelpReadingMode && (
          <NavigationBreadcrumb className="px-3 sm:px-4 pt-3 pb-0" />
        )}

        <div className={cn(
          "relative flex-1 overflow-y-auto overflow-x-hidden terminal-content scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent",
          // F5-T02: padding inferior extra en mobile para que el tab bar no tape contenido
          currentView === 'help' ? "p-0" : "px-3 sm:px-4 pt-0 pb-24 sm:pb-24 lg:pb-28"
        )}>
          <ParticleBackground />
          <Suspense fallback={
            <ViewLoadingSplash
              label={currentView === 'cost-sheets' ? 'Tablero Principal' : String(currentView).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              showTips={currentView === 'cost-sheets' || currentView === 'ipv'}
            />
          }>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] as any }}
                className={cn(
                  "mx-auto w-full",
                  // POS-3a: POS necesita full-width porque ahora tiene un sidebar derecha
                  // fixed (carrito). max-w-7xl dejaría demasiado espacio muerto a la derecha.
                  (currentView === 'cost-sheets' || currentView === 'ipv' || currentView === 'pos') ? "max-w-none" : "max-w-7xl"
                )}
              >
                <ChunkErrorBoundary chunkName={String(currentView)}>
                  <MobileSafeContainer>
                    {renderActiveView()}
                  </MobileSafeContainer>
                </ChunkErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </main>

      <AnimatePresence>
        {sidebarState !== 'closed' && isMobile && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-30"
            aria-hidden="true" /* FIX-ACC-009 */
            onClick={() => setSidebarState('closed')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      <CreateProductModal />
      <CommandPalette />
      <KeyboardShortcutsModal open={showKeyboardHelp} onOpenChange={setShowKeyboardHelp} />
      {/* F5-T02: ChatBot y FloatingCalculator solo en desktop — en mobile están integrados en el tab bar / sheet "Más" */}
      {currentView !== 'pos' && currentView !== 'help' && !isMobile && <ChatBot />}
      {currentView !== "pos" && !isMobile && <FloatingCalculator />}

      {/* B4: ScrollToTop montado en el shell — escucha .terminal-content scroll */}
      <ScrollToTop />

      {/* F5-T02: Tab bar inferior fija para mobile — reemplaza el sidebar en <768px */}
      <MobileTabBar
        navigationItems={nav.navigationItems}
        currentView={currentView}
        onViewChange={handleViewChange}
      />

      {/* NOTA: HelpFloatingButton removido — se superponía con ChatBot (ambos en bottom-right).
          El acceso a ayuda ya está disponible desde el botón "?" del Header global. */}
    </div>
  );
}
