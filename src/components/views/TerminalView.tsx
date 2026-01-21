'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { useAuthStore, useCartStore, useUIStore, useCanAccess } from '@/store';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseUrl, getProductImageUrl, getStoreLogoUrl } from '@/lib/utils';
import { toast } from 'sonner';
import {
  BarChart3, ShoppingCart, Package, Warehouse, Receipt,
  ClipboardList, FileText, History, Shield, DollarSign,
  Users, Building, Settings
} from 'lucide-react';

// Sub-components
import TerminalLayout from './terminal/TerminalLayout';
import DashboardView from './terminal/DashboardView';
import POSView from './terminal/POSView';
import SalesHistoryView from './terminal/SalesHistoryView';
import StockHistoryView from './terminal/StockHistoryView';
import AuditLogsView from './terminal/AuditLogsView';
import CashClosureView from './terminal/CashClosureView';
import UsersManagementView from './terminal/UsersManagementView';
import StoresManagementView from './terminal/StoresManagementView';
import SettingsView from './terminal/SettingsView';

// Original shared components
import InventoryView from '@/components/InventoryView';
import InventoryCountView from '@/components/InventoryCountView';
import CatalogView from '@/components/CatalogView';
import CostSheetsPage from '@/app/cost-sheets/page';

// UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { X, Calendar, CreditCard, Shield as ShieldIcon, Edit, Trash2, Building as BuildingIcon, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Product, Transaction, UserRole, Profile, Store,
  AuditLog, DashboardKPIs, SalesSummary, PaymentMethod
} from '@/types';

export default function TerminalView() {
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const logout = useAuthStore((state) => state.logout);
  const {
    currentView, setCurrentView,
    notifications, setNotifications
  } = useUIStore();
  const {
    items, addItem, removeItem, updateQuantity,
    clearCart, setDiscount, getTotal, getSubtotal,
    getItemCount, discount
  } = useCartStore();

  const canViewFinancials = useCanAccess('warehouse');

  // State
  const [products, setProducts] = useState<(Product & { product_variants?: any[] })[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [cashClosures, setCashClosures] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [dashboardKPIs, setDashboardKPIs] = useState<DashboardKPIs>({
    gross_sales: 0, cost_of_goods: 0, profit: 0,
  });

  const [salesSummary, setSalesSummary] = useState<SalesSummary>({
    total_billed: 0, transaction_count: 0, average_ticket: 0,
    total_cash: 0, total_transfer: 0,
  });

  // Modal states
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [transactionItems, setTransactionItems] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isEditStoreModalOpen, setIsEditStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isCreateStoreModalOpen, setIsCreateStoreModalOpen] = useState(false);
  const [newStore, setNewStore] = useState({ name: '', address: '' });
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'clerk' as UserRole });
  const [isDeleteStoreModalOpen, setIsDeleteStoreModalOpen] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [userStoreAccess, setUserStoreAccess] = useState<{store_id: string, roles: UserRole[]}[]>([]);

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Data fetching
  const fetchProducts = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_products_for_pos', {
        p_store_id: user.store_id,
        p_search_term: '',
        p_category: ''
      });
      if (error) throw error;
      setProducts(data?.map((item: any) => ({
        ...item,
        public_image_url: getSupabaseUrl('product-images', item.image_url),
      })) || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }, [user]);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_dashboard_kpis', user.role === 'admin' ? {} : { p_store_id: user.store_id });
      if (error) throw error;
      if (data && data.length > 0) {
        const kpis = data[0];
        setDashboardKPIs({
          gross_sales: kpis.total_sales || 0,
          cost_of_goods: kpis.total_cost || 0,
          profit: kpis.total_profit || 0,
        });
        setSalesSummary({
          total_billed: kpis.total_sales || 0,
          transaction_count: kpis.transaction_count || 0,
          average_ticket: kpis.avg_ticket || 0,
          total_cash: kpis.total_cash || 0,
          total_transfer: kpis.total_card || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchProducts();
    }
  }, [user, fetchDashboardData, fetchProducts]);

  // Lazy loading views
  useEffect(() => {
    if (!user) return;
    const fetchers: Record<string, () => void> = {
      sales: async () => {
        const { data } = await supabase.from('transactions')
          .select('*')
          .eq(user.role !== 'admin' ? 'store_id' : '', user.store_id || '')
          .order('created_at', { ascending: false });
        setTransactions(data || []);
      },
      history: async () => {
        const { data } = await supabase.from('stock_movements')
          .select('*, product:products(name, sku)')
          .eq(user.role !== 'admin' ? 'store_id' : '', user.store_id || '')
          .order('created_at', { ascending: false }).limit(100);
        setMovements(data || []);
      },
      audit: async () => {
        const { data } = await supabase.from('audit_logs')
          .select('*, profile:profiles(full_name)')
          .order('created_at', { ascending: false }).limit(100);
        setAuditLogs(data || []);
      },
      users: async () => {
        const query = supabase.from('profiles').select('*');
        if (user.role === 'encargado') query.eq('created_by', user.id);
        const { data } = await query.order('full_name');
        setUsers(data || []);
      },
      stores: async () => {
        const { data } = await (user.role === 'admin'
          ? supabase.from('stores').select('*').order('name')
          : supabase.from('stores').select('*, user_store_access!inner(user_id)').eq('user_store_access.user_id', user.id).order('name'));
        setStores(data || []);
      },
      cash: async () => {
        const { data } = await supabase.from('cash_closures').select('*, profile:profiles(full_name)')
          .eq(user.role !== 'admin' ? 'store_id' : '', user.store_id || '')
          .order('created_at', { ascending: false }).limit(50);
        setCashClosures(data || []);
      }
    };

    if (fetchers[currentView]) fetchers[currentView]();
  }, [user, currentView]);

  // Handlers
  const handleCheckout = async (paymentMethod: PaymentMethod, checkoutDiscount?: { type: string, value: number } | null) => {
    if (items.length === 0 || isProcessing || !user) return;
    setIsProcessing(true);
    const toastId = toast.loading('Procesando venta...');
    try {
      // Use provided discount or fallback to store discount
      const finalDiscount = checkoutDiscount || discount;

      const { error } = await supabase.rpc('create_sale', {
        p_store_id: user.store_id,
        p_seller_id: user.id,
        p_payment_method: paymentMethod,
        p_total_amount: Number(getTotal().toFixed(2)),
        p_subtotal: Number(getSubtotal().toFixed(2)),
        p_discount_type: (finalDiscount?.type || 'fixed') as string,
        p_discount_value: Number(finalDiscount?.value || 0),
        p_items: items.map(i => ({
          product_id: i.product_id, variant_id: i.variant_id,
          quantity: i.quantity, price: i.price, cost: i.cost
        }))
      });
      if (error) throw error;
      toast.success('Venta exitosa', { id: toastId });
      clearCart();
      fetchProducts();
      fetchDashboardData();
    } catch (error: any) {
      toast.error(error.message || 'Error en venta', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    logout();
    router.replace('/login');
  };

  const handleSetActiveStore = async (storeId: string) => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ active_store_id: storeId }).eq('id', user.id);
    if (!error) {
      toast.success('Tienda cambiada');
      window.location.reload(); // Hard reload for simplicity in resetting context
    }
  };

  const fetchTransactionDetails = async (txn: Transaction) => {
    setSelectedTransaction(txn);
    setLoadingDetails(true);
    const { data } = await supabase.from('transaction_items').select('*, products(name, sku)').eq('transaction_id', txn.id);
    setTransactionItems(data || []);
    setLoadingDetails(false);
  };

  const fetchUserStoreAccess = async (userId: string) => {
    const { data } = await supabase.from('user_store_access').select('store_id, roles').eq('user_id', userId);
    setUserStoreAccess(data?.map(d => ({
      store_id: d.store_id,
      roles: Array.isArray(d.roles) ? d.roles as UserRole[] : ['clerk']
    })) || []);
  };

  // Navigation Items logic
  const navigationItems = useMemo(() => {
    if (!user) return [];
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    const all = [
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard', roles: ['admin', 'manager', 'clerk', 'encargado'] },
      { id: 'pos', icon: ShoppingCart, label: 'TPV', roles: ['clerk', 'manager', 'admin', 'encargado'] },
      { id: 'inventory', icon: Package, label: 'Inventario', roles: ['admin', 'manager', 'warehouse', 'encargado'] },
      { id: 'recepcion', icon: Warehouse, label: 'Recepciones', roles: ['warehouse', 'manager', 'encargado'] },
      { id: 'sales', icon: Receipt, label: 'Ventas', roles: ['clerk', 'manager', 'encargado'] },
      { id: 'inventory_count', icon: ClipboardList, label: 'Conteo', roles: ['clerk', 'manager', 'admin', 'encargado'] },
      { id: 'cost-sheets', icon: FileText, label: 'Costos', roles: ['admin', 'manager', 'encargado'] },
      { id: 'catalog', icon: Package, label: 'Catálogo', roles: ['manager', 'admin', 'encargado'] },
      { id: 'history', icon: History, label: 'Stock', roles: ['manager', 'admin', 'encargado'] },
      { id: 'audit', icon: Shield, label: 'Auditoría', roles: ['manager', 'admin', 'encargado'] },
      { id: 'cash', icon: DollarSign, label: 'Caja', roles: ['manager', 'admin', 'encargado'] },
      { id: 'users', icon: Users, label: 'Usuarios', roles: ['admin', 'encargado'] },
      { id: 'stores', icon: Building, label: 'Tiendas', roles: ['admin', 'encargado'] },
      { id: 'settings', icon: Settings, label: 'Config', roles: ['admin', 'manager', 'encargado'] },
    ];
    return all.filter(i => i.roles.some(r => roles.includes(r as any)));
  }, [user]);

  if (loading && !user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  if (!user) return null;

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView kpis={dashboardKPIs} summary={salesSummary} criticalProducts={products.filter(p => p.stock_current <= p.min_stock)} canViewFinancials={canViewFinancials} onViewInventory={() => setCurrentView('inventory')} />;
      case 'pos': return <POSView products={products} searchTerm={searchTerm} onSearchChange={setSearchTerm} items={items} onAddItem={addItem} onRemoveItem={removeItem} onUpdateQuantity={updateQuantity} onClearCart={clearCart} getTotal={getTotal} getSubtotal={getSubtotal} getItemCount={getItemCount} isProcessing={isProcessing} onCheckout={handleCheckout} />;
      case 'sales': return <SalesHistoryView transactions={transactions.filter(t => t.id.includes(searchTerm) && (!selectedStatus || t.status === selectedStatus))} searchTerm={searchTerm} onSearchChange={setSearchTerm} selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} onViewDetails={fetchTransactionDetails} />;
      case 'history': return <StockHistoryView movements={movements.filter(m => m.product?.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} onRefresh={() => {}} />;
      case 'audit': return <AuditLogsView logs={auditLogs.filter(l => l.table_name.includes(searchTerm))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} />;
      case 'cash': return <CashClosureView summary={salesSummary} cashClosures={cashClosures} onProcessClosure={() => toast.info('Próximamente')} />;
      case 'users': return <UsersManagementView users={users.filter(u => u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditUser={(u) => { setEditingUser(u); fetchUserStoreAccess(u.id); setIsEditUserModalOpen(true); }} onCreateUser={() => setIsCreateUserModalOpen(true)} />;
      case 'stores': return <StoresManagementView stores={stores.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditStore={(s) => { setEditingStore(s); setIsEditStoreModalOpen(true); }} onDeleteStore={(s) => { setDeletingStore(s); setIsDeleteStoreModalOpen(true); }} onCreateStore={() => setIsCreateStoreModalOpen(true)} onSetActiveStore={handleSetActiveStore} activeStoreId={user.active_store_id} isAdmin={user.role === 'admin'} />;
      case 'settings': return <SettingsView notifications={notifications} setNotifications={setNotifications} />;
      case 'inventory': return <InventoryView key="inventory" />;
      case 'recepcion': return <InventoryView key="recepcion" />;
      case 'inventory_count': return <InventoryCountView />;
      case 'catalog': return <CatalogView />;
      case 'cost-sheets': return <CostSheetsPage />;
      default: return <DashboardView kpis={dashboardKPIs} summary={salesSummary} criticalProducts={products.filter(p => p.stock_current <= p.min_stock)} canViewFinancials={canViewFinancials} onViewInventory={() => setCurrentView('inventory')} />;
    }
  };

  return (
    <TerminalLayout
      navigationItems={navigationItems}
      currentView={currentView}
      onViewChange={setCurrentView}
      onLogout={handleLogout}
      user={user}
      getActiveRolesLabel={() => user.roles?.join(' + ') || user.role}
    >
      {renderView()}

      {/* Shared Modals */}
      {selectedTransaction && (
        <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
          <DialogContent className="max-w-2xl !rounded-3xl p-0 overflow-hidden bg-background">
            <div className="flex justify-between items-center p-8 border-b border-border bg-primary/5">
              <div>
                <h3 className="text-2xl font-black text-primary uppercase tracking-tighter">Detalle de Operación</h3>
                <p className="text-[10px] text-muted-foreground font-black uppercase mt-1">ID: {selectedTransaction.id}</p>
              </div>
              <button onClick={() => setSelectedTransaction(null)} className="p-2 hover:text-destructive transition-colors"><X /></button>
            </div>
            <div className="p-8 max-h-[70vh] overflow-y-auto">
              {loadingDetails ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Fecha</div>
                      <div className="text-xs font-bold">{new Date(selectedTransaction.created_at).toLocaleString()}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Método</div>
                      <div className="text-xs font-bold uppercase">{selectedTransaction.payment_method}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Estado</div>
                      <div className="text-xs font-bold uppercase text-green-600">{selectedTransaction.status}</div>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground font-black uppercase text-[9px] text-left">
                        <th className="pb-4">Producto</th>
                        <th className="pb-4 text-center">Cant.</th>
                        <th className="pb-4 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactionItems.map(item => (
                        <tr key={item.id} className="border-b border-border/50">
                          <td className="py-4">
                            <div className="font-bold text-xs">{item.products?.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{item.products?.sku}</div>
                          </td>
                          <td className="py-4 text-center font-bold">{item.quantity}</td>
                          <td className="py-4 text-right font-black">${(item.quantity * item.price_at_sale).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end pt-4">
                    <div className="w-64 p-4 bg-primary text-white rounded-2xl shadow-xl">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase">Total Final</span>
                        <span className="text-2xl font-black">${selectedTransaction.total_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Store Modal */}
      <Dialog open={isEditStoreModalOpen} onOpenChange={setIsEditStoreModalOpen}>
        <DialogContent className="!rounded-3xl border-border">
          <DialogHeader><DialogTitle className="font-black uppercase">Configurar Sucursal</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <input type="text" value={editingStore?.name || ''} onChange={e => setEditingStore({ ...editingStore!, name: e.target.value })} className="w-full p-3 rounded-lg border border-border bg-background font-bold" placeholder="Nombre" />
            <input type="text" value={editingStore?.address || ''} onChange={e => setEditingStore({ ...editingStore!, address: e.target.value })} className="w-full p-3 rounded-lg border border-border bg-background text-sm" placeholder="Dirección" />
          </div>
          <DialogFooter>
            <button onClick={() => setIsEditStoreModalOpen(false)} className="px-4 py-2 font-black uppercase text-xs">Cerrar</button>
            <button onClick={async () => {
              const { error } = await supabase.from('stores').update({ name: editingStore?.name, address: editingStore?.address }).eq('id', editingStore?.id);
              if (!error) { toast.success('Actualizado'); setIsEditStoreModalOpen(false); }
            }} className="px-6 py-2 bg-primary text-white rounded-lg font-black uppercase text-xs">Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </TerminalLayout>
  );
}
