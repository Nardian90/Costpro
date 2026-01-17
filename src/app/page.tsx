'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuthStore, useCartStore, useUIStore } from '@/store';
import { useRouter } from 'next/navigation';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/lib/supabaseClient';
import {
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  Check,
  Download,
  Upload,
  Filter,
  Bell,
  TrendingUp,
  TrendingDown,
  Eye,
  Edit,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown,
  Sun,
  Moon,
  Warehouse,
  Receipt,
  Users,
  Building,
  History,
  Target,
  Shield,
  ClipboardList,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type {
  UserRole,
  Product,
  CartItem,
  Transaction,
  TransactionItem,
  PaymentMethod,
  DiscountType,
  DashboardKPIs,
  SalesSummary,
  AuditLog,
} from '@/types';
import { toast } from 'sonner';
import WarehouseView from '@/components/WarehouseView';
import InventoryCountView from '@/components/InventoryCountView';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth(); // Sync Supabase session with store
  const logout = useAuthStore((state) => state.logout);
  const {
    sidebarOpen,
    darkMode,
    toggleSidebar,
    toggleDarkMode,
    currentView,
    setCurrentView,
    notifications,
    setNotifications
  } = useUIStore();
  const { items, addItem, removeItem, updateQuantity, clearCart, setDiscount, getTotal, getSubtotal, getItemCount, discount } = useCartStore();

  const [showCart, setShowCart] = useState(false);

  const [products, setProducts] = useState<(Product & { product_variants?: any[] })[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [cashClosures, setCashClosures] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const [dashboardKPIs, setDashboardKPIs] = useState<DashboardKPIs>({
    gross_sales: 0,
    cost_of_goods: 0,
    profit: 0,
  });

  const [salesSummary, setSalesSummary] = useState<SalesSummary>({
    total_billed: 0,
    transaction_count: 0,
    average_ticket: 0,
    total_cash: 0,
    total_transfer: 0,
  });

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchProducts();
      fetchTransactions();
      fetchUsers();
      fetchAuditLogs();
      fetchMovements();
      fetchCashClosures();
    }
  }, [user]);

  const fetchProducts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          inventory(*),
          product_variants(*)
        `)
        .order('name');

      if (error) throw error;

      const mappedProducts: Product[] = data?.map((item: any) => {
        let stock_current = 0;
        let store_id: string | null = null;

        if (user.role === 'admin') {
          stock_current = item.inventory?.reduce(
            (acc: number, inv: any) => acc + inv.quantity,
            0
          ) || 0;
        } else {
          const storeInventory = item.inventory?.find(
            (inv: any) => inv.store_id === user.store_id
          );
          stock_current = storeInventory ? storeInventory.quantity : 0;
          store_id = user.store_id;
        }

        return {
          ...item,
          stock_current,
          store_id,
        };
      }) || [];

      setProducts(mappedProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;
    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (user.role !== 'admin' && user.store_id) {
        query = query.eq('store_id', user.store_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchUsers = async () => {
    if (!user || user.role !== 'admin') return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchAuditLogs = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return;
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          profile:profiles (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    }
  };

  const fetchMovements = async () => {
    if (!user) return;
    try {
      let query = supabase
        .from('stock_movements')
        .select(`
          *,
          product:products (name, sku)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (user.role !== 'admin' && user.store_id) {
        query = query.eq('store_id', user.store_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMovements(data || []);
    } catch (error) {
      console.error('Error fetching movements:', error);
    }
  };

  const fetchCashClosures = async () => {
    if (!user) return;
    try {
      let query = supabase
        .from('cash_closures')
        .select(`
          *,
          profile:profiles (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (user.role !== 'admin' && user.store_id) {
        query = query.eq('store_id', user.store_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCashClosures(data || []);
    } catch (error) {
      console.error('Error fetching cash closures:', error);
    }
  };

  const fetchDashboardData = async () => {
    if (!user) return;

    try {
      let query = supabase.rpc('get_dashboard_kpis', {});

      if (user.role !== 'admin' && user.store_id) {
        query = supabase.rpc('get_dashboard_kpis', { p_store_id: user.store_id });
      }

      const { data, error } = await query;

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
  };
  // States for views
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isVariantsModalOpen, setIsVariantsModalOpen] = useState(false);
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newVariantForm, setNewVariantForm] = useState({ name: '', price: 0, conversion_factor: 1 });

  const [stockAdjustment, setStockAdjustment] = useState({ quantity: 0, reason: '' });
  const [receiptForm, setReceiptForm] = useState({ supplier: '', reference: '' });
  const [localDiscount, setLocalDiscount] = useState({ type: 'fixed' as DiscountType, value: 0 });
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');

  // Transaction details state
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [transactionItems, setTransactionItems] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Check authentication
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Sync local discount with store
  useEffect(() => {
    setDiscount(localDiscount.value > 0 ? localDiscount : null);
  }, [localDiscount, setDiscount]);

  const navigationItems = useMemo(() => {
    if (!user) return [];
    return getNavigationItems();
  }, [user?.role]);

  const filteredProducts = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(lowerSearch) ||
      (p.sku && p.sku.toLowerCase().includes(lowerSearch)) ||
      (p.category && p.category.toLowerCase().includes(lowerSearch))
    );
  }, [products, searchTerm]);

  const filteredMovements = useMemo(() => {
    return movements.filter(mov => {
      const movDate = new Date(mov.created_at);
      const fromDate = dateRange.from ? new Date(dateRange.from) : null;
      const toDate = dateRange.to ? new Date(dateRange.to) : null;

      if (fromDate && movDate < fromDate) return false;
      if (toDate && movDate > toDate) return false;
      return true;
    });
  }, [movements, dateRange]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const logDate = new Date(log.created_at);
      const fromDate = dateRange.from ? new Date(dateRange.from) : null;
      const toDate = dateRange.to ? new Date(dateRange.to) : null;

      if (fromDate && logDate < fromDate) return false;
      if (toDate && logDate > toDate) return false;
      return true;
    });
  }, [auditLogs, dateRange]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const addToCart = (product: Product) => {
    addItem({
      product_id: product.id,
      variant_id: null,
      product: product,
      variant: null,
      quantity: 1,
      price: product.price,
      cost: product.cost_price,
      subtotal: product.price,
    });
    setShowCart(true);
    toast.success(`${product.name} agregado al carrito`);
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (!user || !user.store_id) {
      toast.error('No se pudo identificar la tienda del usuario');
      return;
    }

    const toastId = toast.loading('Procesando venta...');
    try {
      const saleItems = items.map(item => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price: item.price,
        cost: item.cost
      }));

      const { data: transactionId, error } = await supabase.rpc('create_sale', {
        p_store_id: user.store_id,
        p_seller_id: user.id,
        p_payment_method: selectedPayment,
        p_total_amount: Number(getTotal().toFixed(2)),
        p_subtotal: Number(getSubtotal().toFixed(2)),
        p_discount_type: (discount?.type || 'fixed') as string,
        p_discount_value: Number(discount?.value || 0),
        p_items: saleItems
      });

      if (error) throw error;

      toast.success('Venta realizada con éxito', { id: toastId });
      clearCart();
      setShowCart(false);

      // Refresh data
      fetchProducts();
      fetchTransactions();
      fetchDashboardData();
    } catch (error: any) {
      console.error('Error en checkout:', error);
      toast.error(error.message || 'Error al procesar la venta', { id: toastId });
    }
  };

  const handleReceiptSubmit = () => {
    toast.info('Para registrar recepciones, use la sección de Inventario');
    setCurrentView('inventory');
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct || !editingProduct.name) {
      toast.error('El nombre es obligatorio');
      return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .update({ name: editingProduct.name })
        .eq('id', editingProduct.id);

      if (error) throw error;
      toast.success('Producto actualizado');
      setIsEditProductModalOpen(false);
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar producto');
    }
  };

  const handleUpdateImage = async (file: File) => {
    if (!editingProduct) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 2MB');
      return;
    }

    const toastId = toast.loading('Subiendo imagen...');
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${editingProduct.id}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('products')
        .update({ image_url: fileName })
        .eq('id', editingProduct.id);

      if (updateError) throw updateError;

      toast.success('Imagen actualizada', { id: toastId });
      setEditingProduct({ ...editingProduct, image_url: fileName });
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message || 'Error al subir imagen', { id: toastId });
    }
  };

  const handleAddVariant = async (newVariant: any) => {
    if (!editingProduct) return;
    try {
      const { error } = await supabase
        .from('product_variants')
        .insert([{
          product_id: editingProduct.id,
          name: newVariant.name,
          price: newVariant.price,
          conversion_factor: newVariant.conversion_factor || 1
        }]);

      if (error) throw error;
      toast.success('Variante agregada');
      fetchProducts();
      // Refresh editing product variants
      const { data } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', editingProduct.id);
      setEditingProduct({ ...editingProduct, product_variants: data || [] });
    } catch (error: any) {
      toast.error(error.message || 'Error al agregar variante');
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    try {
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', variantId);

      if (error) throw error;
      toast.success('Variante eliminada');
      fetchProducts();
      // Refresh editing product variants
      const { data } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', editingProduct.id);
      setEditingProduct({ ...editingProduct, product_variants: data || [] });
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar variante');
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      logout();
      router.replace('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      logout();
      router.replace('/login');
    }
  };

  const fetchTransactionDetails = async (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setLoadingDetails(true);
    try {
      const { data, error } = await supabase
        .from('transaction_items')
        .select(`
          *,
          products (
            name,
            sku
          )
        `)
        .eq('transaction_id', transaction.id);

      if (error) throw error;
      setTransactionItems(data || []);
    } catch (error) {
      console.error('Error fetching transaction items:', error);
      toast.error('Error al cargar los detalles de la venta');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Get role-specific navigation
  function getNavigationItems() {
    if (!user) return [];
    const role = user.role;
    const items = [
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard', roles: ['admin', 'manager', 'clerk'] },
      { id: 'pos', icon: ShoppingCart, label: 'Punto de Venta', roles: ['clerk', 'manager', 'admin'] },
      { id: 'inventory', icon: Package, label: 'Inventario', roles: ['admin', 'manager', 'warehouse'] },
      { id: 'recepcion', icon: Warehouse, label: 'Recepciones', roles: ['warehouse', 'manager'] },
      { id: 'sales', icon: Receipt, label: 'Mis Ventas', roles: ['clerk', 'manager'] },
      { id: 'inventory_count', icon: ClipboardList, label: 'Conteo Inventario', roles: ['clerk', 'manager', 'admin'] },
      { id: 'catalog', icon: Package, label: 'Catálogo', roles: ['manager', 'admin'] },
      { id: 'history', icon: History, label: 'Historial', roles: ['manager', 'admin'] },
      { id: 'audit', icon: Shield, label: 'Auditoría', roles: ['manager', 'admin'] },
      { id: 'cash', icon: DollarSign, label: 'Cierre Caja', roles: ['manager', 'admin'] },
      { id: 'users', icon: Users, label: 'Usuarios', roles: ['admin'] },
      { id: 'stores', icon: Building, label: 'Tiendas', roles: ['admin'] },
      { id: 'settings', icon: Settings, label: 'Configuración', roles: ['admin', 'manager'] },
    ];

    return items.filter(item => item.roles.includes(role));
  };

  // ==================== VIEWS ====================

  const renderDashboard = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 ${user?.role !== 'clerk' ? 'md:grid-cols-3' : ''} gap-6`}>
        <div className="neu-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Ventas Totales</span>
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div className="text-3xl font-bold">${dashboardKPIs.gross_sales.toFixed(2)}</div>
          <div className="text-sm text-muted-foreground mt-1">Hoy</div>
        </div>

        {user?.role !== 'clerk' && (
          <>
            <div className="neu-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Costo de Ventas</span>
                <Target className="w-5 h-5 text-warning" />
              </div>
              <div className="text-3xl font-bold">${dashboardKPIs.cost_of_goods.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground mt-1">Hoy</div>
            </div>

            <div className="neu-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Utilidad</span>
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
              <div className="text-3xl font-bold text-success">${dashboardKPIs.profit.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground mt-1">Hoy</div>
            </div>
          </>
        )}
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="neu-card">
          <h3 className="font-semibold mb-4">Resumen de Ventas</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Transacciones:</span>
              <span className="font-bold">{salesSummary.transaction_count}</span>
            </div>
            <div className="flex justify-between">
              <span>Ticket Promedio:</span>
              <span className="font-bold">${salesSummary.average_ticket.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Efectivo:</span>
              <span className="font-bold text-success">${salesSummary.total_cash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Transferencias:</span>
              <span className="font-bold text-primary">${salesSummary.total_transfer.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="neu-card">
          <h3 className="font-semibold mb-4">Alertas de Stock</h3>
          <div className="space-y-3">
            {products.filter(p => p.stock_current <= p.min_stock).map(product => (
              <div key={product.id} className="neu-raised-sm p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-muted-foreground">{product.sku}</div>
                  </div>
                  <div className="text-danger font-bold">{product.stock_current} uds</div>
                </div>
              </div>
            ))}
            {products.filter(p => p.stock_current <= p.min_stock).length === 0 && (
              <p className="text-sm text-muted-foreground">No hay alertas de stock bajo</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPOS = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Punto de Venta</h2>
        <button
          onClick={() => setShowCart(!showCart)}
          className="neu-btn neu-btn-primary flex items-center gap-2 relative"
        >
          <ShoppingCart className="w-5 h-5" />
          <span>Carrito</span>
          {getItemCount() > 0 && (
            <span className="neu-badge absolute -top-2 -right-2">
              {getItemCount()}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Grid */}
        <div className="lg:col-span-2">
          <div className="neu-raised-sm p-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="neu-input w-full pl-10"
                placeholder="Buscar productos..."
                aria-label="Buscar productos en el catálogo"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                type="button"
                className="neu-card p-4 cursor-pointer hover:scale-105 transition-transform w-full text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={() => addToCart(product)}
                aria-label={`Agregar ${product.name} al carrito. Precio: $${product.price.toFixed(2)}. Stock disponible: ${product.stock_current}`}
              >
                <div className="neu-raised-sm w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-sm mb-1 text-center">{product.name}</h3>
                <div className="text-xs text-muted-foreground text-center mb-2">{product.sku}</div>
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">${product.price.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">Stock: {product.stock_current}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart Panel */}
        {showCart && (
          <div className="neu-card h-fit sticky top-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Carrito de Compras
            </h3>

            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>El carrito está vacío</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                  {items.map(item => (
                    <div key={`${item.product_id}-${item.variant_id}`} className="neu-raised-sm p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.product.name}</div>
                          <div className="text-xs text-muted-foreground">${item.price.toFixed(2)} / ud</div>
                        </div>
                        <button
                          onClick={() => removeItem(item.product_id, item.variant_id)}
                          className="text-danger hover:text-red-600"
                          aria-label={`Eliminar ${item.product.name} del carrito`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                            className="neu-raised-sm w-8 h-8 flex items-center justify-center hover:bg-accent"
                            aria-label={`Disminuir cantidad de ${item.product.name}`}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-medium" aria-label={`Cantidad: ${item.quantity}`}>{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                            className="neu-raised-sm w-8 h-8 flex items-center justify-center hover:bg-accent"
                            aria-label={`Aumentar cantidad de ${item.product.name}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="font-bold">${item.subtotal.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Discount */}
                <div className="neu-inset-sm p-3 mb-4">
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => setLocalDiscount({ ...localDiscount, type: 'fixed' })}
                      className={`flex-1 p-2 text-sm rounded ${localDiscount.type === 'fixed' ? 'neu-raised-sm bg-accent' : ''}`}
                    >
                      Fijo
                    </button>
                    <button
                      onClick={() => setLocalDiscount({ ...localDiscount, type: 'percentage' })}
                      className={`flex-1 p-2 text-sm rounded ${localDiscount.type === 'percentage' ? 'neu-raised-sm bg-accent' : ''}`}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={localDiscount.value === 0 ? '' : localDiscount.value}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      setLocalDiscount({ ...localDiscount, value: isNaN(val) ? 0 : val });
                    }}
                    className="neu-input w-full text-sm"
                    placeholder="0"
                  />
                  <button
                    onClick={() => setLocalDiscount({ type: 'fixed', value: 0 })}
                    className="w-full mt-2 text-xs text-muted-foreground hover:text-danger"
                  >
                    Limpiar descuento
                  </button>
                </div>

                {/* Totals */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>${getSubtotal().toFixed(2)}</span>
                  </div>
                  {localDiscount.value > 0 && (
                    <div className="flex justify-between text-sm text-success">
                      <span>Descuento:</span>
                      <span>-${localDiscount.type === 'fixed' ? localDiscount.value.toFixed(2) : localDiscount.value + '%'}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                    <span>Total:</span>
                    <span>${getTotal().toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Método de Pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPayment('cash')}
                      className={`neu-raised-sm p-3 flex items-center justify-center gap-2 transition-all ${
                        selectedPayment === 'cash'
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                        : 'hover:bg-accent'
                      }`}
                    >
                      <DollarSign className="w-4 h-4" />
                      <span className="text-sm font-bold">Efectivo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPayment('transfer')}
                      className={`neu-raised-sm p-3 flex items-center justify-center gap-2 transition-all ${
                        selectedPayment === 'transfer'
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                        : 'hover:bg-accent'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span className="text-sm font-bold">Transferencia</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  className="neu-btn neu-btn-success w-full flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Procesar Venta
                </button>

                <button
                  onClick={() => {
                    clearCart();
                    setShowCart(false);
                  }}
                  className="neu-btn w-full mt-2"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );



  const renderRecepcion = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Recepción de Productos</h2>

      <div className="neu-card">
        <h3 className="font-semibold mb-4">Nueva Recepción</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Proveedor</label>
              <input
                type="text"
                value={receiptForm.supplier}
                onChange={(e) => setReceiptForm({ ...receiptForm, supplier: e.target.value })}
                className="neu-input w-full"
                placeholder="Nombre del proveedor"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Referencia de Factura</label>
              <input
                type="text"
                value={receiptForm.reference}
                onChange={(e) => setReceiptForm({ ...receiptForm, reference: e.target.value })}
                className="neu-input w-full"
                placeholder="Número de factura"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Productos</label>
            <div className="neu-raised-sm p-4 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Haz clic en los productos para agregarlos a la recepción</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleReceiptSubmit}
              className="neu-btn neu-btn-primary flex-1"
            >
              Crear Recepción
            </button>
            <button
              onClick={() => setReceiptForm({ supplier: '', reference: '' })}
              className="neu-btn flex-1"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSales = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Mis Ventas</h2>

      <div className="neu-raised-sm p-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              className="neu-input w-full pl-10"
              placeholder="Buscar por ID, monto..."
              aria-label="Buscar en el historial de ventas por ID o monto"
            />
          </div>
          <select className="neu-input">
            <option value="">Todos los estados</option>
            <option value="completed">Completada</option>
            <option value="pending">Pendiente</option>
            <option value="voided">Anulada</option>
          </select>
        </div>
      </div>

      <div className="table-to-cards">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="p-4 text-left">ID</th>
              <th className="p-4 text-left">Fecha</th>
              <th className="p-4 text-left">Método</th>
              <th className="p-4 text-right">Total</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(txn => (
              <tr key={txn.id}>
                <td data-label="ID" className="p-4 font-medium">{txn.id}</td>
                <td data-label="Fecha" className="p-4">
                  {new Date(txn.created_at).toLocaleString()}
                </td>
                <td data-label="Método" className="p-4">
                  {txn.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'}
                </td>
                <td data-label="Total" className="p-4 text-right font-bold">
                  ${txn.total_amount.toFixed(2)}
                </td>
                <td data-label="Estado" className="p-4 text-center">
                  <span className={`neu-badge ${txn.status === 'completed' ? 'text-success' :
                    txn.status === 'pending' ? 'text-warning' : 'text-danger'
                    }`}>
                    {txn.status}
                  </span>
                </td>
                <td data-label="Acciones" className="p-4">
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchTransactionDetails(txn)}
                      className="neu-raised-sm w-8 h-8 flex items-center justify-center hover:bg-accent transition-transform active:scale-95"
                      title="Ver Detalle"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderCatalog = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Catálogo de Productos</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.map(product => (
          <div key={product.id} className="neu-card">
            <div className="neu-raised-sm w-full h-32 mb-4 flex items-center justify-center overflow-hidden">
              {product.image_url ? (
                <img src={getProductImageUrl(product) || ''} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Package className="w-16 h-16 text-muted-foreground" />
              )}
            </div>

            <h3 className="font-semibold mb-1">{product.name}</h3>
            <p className="text-sm text-muted-foreground mb-2">{product.description}</p>
            <div className="text-xs text-muted-foreground mb-3">
              SKU: {product.sku} | {product.category}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <div className="neu-inset-sm p-2 text-center">
                <div className="text-xs text-muted-foreground">Costo</div>
                <div className="font-medium">${product.cost_price.toFixed(2)}</div>
              </div>
              <div className="neu-inset-sm p-2 text-center">
                <div className="text-xs text-muted-foreground">Venta</div>
                <div className="font-medium text-primary">${product.price.toFixed(2)}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingProduct(product);
                  setIsEditProductModalOpen(true);
                }}
                className="neu-btn neu-raised-sm flex-1 text-sm flex items-center justify-center gap-1"
                title="Editar nombre e imagen"
              >
                <Edit className="w-4 h-4" />
                <span>Editar</span>
              </button>
              <button
                onClick={() => {
                  setEditingProduct(product);
                  setIsVariantsModalOpen(true);
                }}
                className="neu-btn neu-raised-sm flex-1 text-sm flex items-center justify-center gap-1"
                title="Variantes de precio"
              >
                <DollarSign className="w-4 h-4" />
                <span>Precios</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHistory = () => {

    const getMovementBadge = (type: string) => {
      switch (type) {
        case 'sale': return 'text-primary bg-primary/10';
        case 'purchase': return 'text-success bg-success/10';
        case 'adjustment': return 'text-warning bg-warning/10';
        default: return 'text-muted-foreground bg-accent';
      }
    };

    const getMovementLabel = (type: string) => {
      switch (type) {
        case 'sale': return 'Venta';
        case 'purchase': return 'Recepción';
        case 'adjustment': return 'Ajuste';
        default: return type;
      }
    };

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Historial General de Movimientos</h2>
        <div className="neu-raised-sm p-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <label className="text-[10px] font-bold mb-1 block uppercase">Desde</label>
              <input
                type="date"
                className="neu-input w-full"
                value={dateRange.from}
                onChange={e => setDateRange({ ...dateRange, from: e.target.value })}
              />
            </div>
            <div className="relative flex-1">
              <label className="text-[10px] font-bold mb-1 block uppercase">Hasta</label>
              <input
                type="date"
                className="neu-input w-full"
                value={dateRange.to}
                onChange={e => setDateRange({ ...dateRange, to: e.target.value })}
              />
            </div>
            <button
              onClick={fetchMovements}
              className="neu-btn self-end"
            >
              Refrescar
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {filteredMovements.map(mov => (
            <div key={mov.id} className="neu-card flex items-center justify-between hover:scale-[1.01] transition-transform">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getMovementBadge(mov.movement_type)}`}>
                  {mov.movement_type === 'sale' ? <ArrowUpRight className="w-6 h-6" /> :
                   mov.movement_type === 'purchase' ? <ArrowDownRight className="w-6 h-6" /> :
                   <ArrowUpDown className="w-6 h-6" />}
                </div>
                <div>
                  <div className="font-bold">{mov.product?.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="font-mono">{mov.product?.sku}</span>
                    <span>•</span>
                    <span className="font-medium">{getMovementLabel(mov.movement_type)}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${mov.quantity_change > 0 ? 'text-success' : 'text-danger'}`}>
                  {mov.quantity_change > 0 ? '+' : ''}{mov.quantity_change} und.
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold">
                  {new Date(mov.created_at).toLocaleString()}
                </div>
                <div className="text-xs italic text-muted-foreground">
                  Ref: {mov.reference_doc || 'N/A'}
                </div>
              </div>
            </div>
          ))}
          {filteredMovements.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No se encontraron movimientos en el periodo seleccionado.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAudit = () => {

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Auditoría del Sistema</h2>
            <div className="neu-raised-sm p-4">
                <div className="flex gap-4">
                    <div className="relative flex-1">
                        <input
                            type="date"
                            className="neu-input w-full"
                            placeholder="Fecha de inicio"
                            value={dateRange.from}
                            onChange={e => setDateRange({ ...dateRange, from: e.target.value })}
                        />
                    </div>
                    <div className="relative flex-1">
                        <input
                            type="date"
                            className="neu-input w-full"
                            placeholder="Fecha de fin"
                            value={dateRange.to}
                            onChange={e => setDateRange({ ...dateRange, to: e.target.value })}
                        />
                    </div>
                </div>
            </div>
            <div className="table-to-cards">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="p-4 text-left">Fecha</th>
                            <th className="p-4 text-left">Usuario</th>
                            <th className="p-4 text-left">Acción</th>
                            <th className="p-4 text-left">Tabla</th>
                            <th className="p-4 text-left">Detalles</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLogs.map((log) => (
                            <tr key={log.id}>
                                <td data-label="Fecha" className="p-4">
                                  <div className="text-sm">{new Date(log.created_at).toLocaleDateString()}</div>
                                  <div className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</div>
                                </td>
                                <td data-label="Usuario" className="p-4">
                                  <div className="font-medium">{(log as any).profile?.full_name || 'Sistema'}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono truncate w-24" title={log.user_id || ''}>
                                    {log.user_id?.split('-')[0]}
                                  </div>
                                </td>
                                <td data-label="Acción" className="p-4">
                                    <span className={`neu-badge ${
                                        ['INSERT', 'CREATE', 'ADD'].includes(log.action) ? 'text-success' :
                                        ['UPDATE', 'EDIT'].includes(log.action) ? 'text-warning' : 'text-danger'
                                        }`}>
                                        {log.action}
                                    </span>
                                </td>
                                <td data-label="Tabla" className="p-4 font-medium">{log.table_name}</td>
                                <td data-label="Detalles" className="p-4 text-sm text-muted-foreground">
                                    {log.record_id}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

  const renderCash = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Cierre de Caja</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="neu-card">
          <h3 className="font-semibold mb-4">Declaración de Cajero</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Efectivo Declarado</label>
              <input type="number" className="neu-input w-full" placeholder="0.00" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Vales/Transferencias Declarados</label>
              <input type="number" className="neu-input w-full" placeholder="0.00" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notas</label>
              <textarea className="neu-input w-full h-20" placeholder="Observaciones..." />
            </div>
          </div>
        </div>

        <div className="neu-card">
          <h3 className="font-semibold mb-4">Resumen del Sistema</h3>

          <div className="space-y-3">
            <div className="flex justify-between p-3 neu-inset-sm">
              <span>Total Esperado (Sistema)</span>
              <span className="font-bold">${salesSummary.total_billed.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-3 neu-inset-sm">
              <span className="text-success">Efectivo</span>
              <span>${salesSummary.total_cash.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-3 neu-inset-sm">
              <span className="text-primary">Transferencias</span>
              <span>${salesSummary.total_transfer.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-3 neu-raised-sm">
              <span className="font-semibold">Diferencia</span>
              <span className={`font-bold ${salesSummary.total_billed > salesSummary.total_billed ? 'text-success' : 'text-danger'
                }`}>
                $0.00
              </span>
            </div>
          </div>

          <button
            onClick={() => toast.info('Funcionalidad de procesar cierre en desarrollo')}
            className="neu-btn neu-btn-primary w-full mt-4"
          >
            Procesar Cierre de Caja
          </button>
        </div>
      </div>

      {/* Historial de Cierres */}
      <div className="neu-card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <History className="w-5 h-5" />
          Historial de Cierres de Caja
        </h3>

        <div className="table-to-cards">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="p-4 text-left">Fecha</th>
                <th className="p-4 text-left">Cajero</th>
                <th className="p-4 text-right">Total Sistema</th>
                <th className="p-4 text-right">Diferencia</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cashClosures.map((closure) => (
                <tr key={closure.id}>
                  <td data-label="Fecha" className="p-4">
                    <div className="text-sm">{new Date(closure.created_at).toLocaleDateString()}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(closure.created_at).toLocaleTimeString()}</div>
                  </td>
                  <td data-label="Cajero" className="p-4 font-medium">{closure.profile?.full_name}</td>
                  <td data-label="Total Sistema" className="p-4 text-right font-bold">${closure.system_expected_total?.toFixed(2) || closure.system_total?.toFixed(2)}</td>
                  <td data-label="Diferencia" className="p-4 text-right">
                    <span className={`font-bold ${closure.difference < 0 ? 'text-danger' : 'text-success'}`}>
                      ${closure.difference?.toFixed(2)}
                    </span>
                  </td>
                  <td data-label="Acciones" className="p-4">
                    <div className="flex justify-center">
                      <button className="neu-raised-sm w-8 h-8 flex items-center justify-center hover:bg-accent">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {cashClosures.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground italic">
                    No hay cierres de caja registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Gestión de Usuarios</h2>
        <button className="neu-btn neu-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      <div className="table-to-cards">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="p-4 text-left">Usuario</th>
              <th className="p-4 text-left">Email</th>
              <th className="p-4 text-left">Rol</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="Usuario" className="p-4 font-medium">{u.full_name}</td>
                <td data-label="Email" className="p-4">{u.email}</td>
                <td data-label="Rol" className="p-4">
                  <span className={`neu-badge ${u.role === 'admin' ? 'text-primary' :
                    u.role === 'manager' ? 'text-secondary' :
                      u.role === 'clerk' ? 'text-success' : 'text-warning'
                    }`}>
                    {u.role}
                  </span>
                </td>
                <td data-label="Estado" className="p-4 text-center">
                  <span className={`neu-badge ${u.is_active ? 'text-success' : 'text-danger'}`}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td data-label="Acciones" className="p-4">
                  <div className="flex justify-center gap-2">
                    <button className="neu-raised-sm w-8 h-8 flex items-center justify-center hover:bg-accent">
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStores = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Gestión de Tiendas</h2>
        <button className="neu-btn neu-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nueva Tienda
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { name: 'Tienda Central', address: 'Av. Principal #123', active: true },
          { name: 'Sucursal Norte', address: 'Calle Norte #456', active: true },
          { name: 'Sucursal Sur', address: 'Boulevard Sur #789', active: false },
        ].map((store, i) => (
          <div key={i} className="neu-card">
            <div className="flex items-start justify-between mb-4">
              <div className="neu-raised-sm w-12 h-12 flex items-center justify-center">
                <Building className="w-6 h-6 text-muted-foreground" />
              </div>
              <span className={`neu-badge ${store.active ? 'text-success' : 'text-danger'}`}>
                {store.active ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <h3 className="font-semibold mb-1">{store.name}</h3>
            <p className="text-sm text-muted-foreground mb-4">{store.address}</p>

            <div className="flex gap-2">
              <button className="neu-btn neu-raised-sm flex-1 text-sm">
                <Edit className="w-4 h-4" />
              </button>
              <button className="neu-btn neu-raised-sm flex-1 text-sm text-danger">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Configuración</h2>

      <div className="space-y-6">
        <div className="neu-card">
          <h3 className="font-semibold mb-4">Apariencia</h3>

          <div className="flex items-center justify-between p-4 neu-raised-sm">
            <div>
              <div className="font-medium">Modo Oscuro</div>
              <div className="text-sm text-muted-foreground">Cambiar tema de la aplicación</div>
            </div>
            <button
              onClick={toggleDarkMode}
              className="neu-raised-sm w-12 h-12 flex items-center justify-center hover:bg-accent"
            >
              {darkMode ? <Sun className="w-6 h-6 text-warning" /> : <Moon className="w-6 h-6 text-primary" />}
            </button>
          </div>
        </div>

        <div className="neu-card">
          <h3 className="font-semibold mb-4">Notificaciones</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 neu-raised-sm">
              <div>
                <div className="font-medium">Alertas de Stock Bajo</div>
                <div className="text-sm text-muted-foreground">Notificar cuando el stock esté bajo</div>
              </div>
              <button
                onClick={() => setNotifications({ lowStock: !notifications.lowStock })}
                className={`neu-badge cursor-pointer transition-colors ${notifications.lowStock ? 'text-success' : 'text-muted-foreground bg-accent'}`}
              >
                {notifications.lowStock ? 'Activo' : 'Inactivo'}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 neu-raised-sm">
              <div>
                <div className="font-medium">Notificaciones de Ventas</div>
                <div className="text-sm text-muted-foreground">Alertas en tiempo real</div>
              </div>
              <button
                onClick={() => setNotifications({ salesAlerts: !notifications.salesAlerts })}
                className={`neu-badge cursor-pointer transition-colors ${notifications.salesAlerts ? 'text-success' : 'text-muted-foreground bg-accent'}`}
              >
                {notifications.salesAlerts ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return renderDashboard();
      case 'pos': return renderPOS();
      case 'inventory': return <WarehouseView key="inventory" />;
      case 'recepcion': return <WarehouseView initialView="history" key="history" />;
      case 'sales': return renderSales();
      case 'inventory_count': return <InventoryCountView />;
      case 'catalog': return renderCatalog();
      case 'history': return renderHistory();
      case 'audit': return renderAudit();
      case 'cash': return renderCash();
      case 'users': return renderUsers();
      case 'stores': return renderStores();
      case 'settings': return renderSettings();
      default: return renderDashboard();
    }
  };

  const getRoleLabel = (role: UserRole) => {
    const labels: Record<UserRole, string> = {
      admin: 'Administrador',
      manager: 'Encargado',
      clerk: 'Cajero',
      warehouse: 'Almacén',
    };
    return labels[role];
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} lg:w-64 fixed lg:sticky top-0 h-screen z-40 transition-all duration-300 overflow-hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="neu-raised h-full flex flex-col">
          {/* Logo */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="neu-raised-sm w-10 h-10 flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="font-bold">POS Enterprise</h1>
                <p className="text-xs text-muted-foreground">v1.0.0</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {navigationItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${currentView === item.id ? 'bg-accent' : 'hover:bg-accent'
                    }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-border">
            <div className="neu-raised-sm p-3">
              <div className="font-medium text-sm">{user?.full_name}</div>
              <div className="text-xs text-muted-foreground">{getRoleLabel(user?.role || 'clerk')}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen">
        {/* Header */}
        <header className="neu-raised-sm p-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSidebar}
                className="neu-raised-sm w-10 h-10 flex items-center justify-center hover:bg-accent lg:hidden"
                aria-label={sidebarOpen ? "Cerrar menú lateral" : "Abrir menú lateral"}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <div>
                <h1 className="text-xl font-bold capitalize">
                  {navigationItems.find(i => i.id === currentView)?.label || 'Dashboard'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Bienvenido, {user?.full_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleDarkMode}
                className="neu-raised-sm w-10 h-10 flex items-center justify-center hover:bg-accent"
                aria-label={darkMode ? "Activar modo claro" : "Activar modo oscuro"}
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <button
                className="neu-raised-sm w-10 h-10 flex items-center justify-center hover:bg-accent relative"
                aria-label="Ver notificaciones"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-danger rounded-full" />
              </button>

              <button
                onClick={handleLogout}
                className="neu-btn neu-btn-danger flex items-center gap-2"
                aria-label="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 md:p-6 pb-20">
          {renderView()}
        </div>
      </main>


      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="neu-card max-w-2xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 p-4 border-b">
              <div>
                <h3 className="text-lg font-bold">Detalle de Venta</h3>
                <p className="text-xs text-muted-foreground font-mono">{selectedTransaction.id}</p>
              </div>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="neu-raised-sm w-10 h-10 flex items-center justify-center hover:bg-accent"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {/* Transaction Summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="neu-inset-sm p-3">
                  <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Fecha</div>
                  <div className="font-medium text-sm">
                    {new Date(selectedTransaction.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="neu-inset-sm p-3">
                  <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Método de Pago</div>
                  <div className="font-medium text-sm capitalize">
                    {selectedTransaction.payment_method === 'cash' ? 'Efectivo' :
                     selectedTransaction.payment_method === 'card' ? 'Tarjeta' :
                     selectedTransaction.payment_method === 'transfer' ? 'Transferencia' : 'Otro'}
                  </div>
                </div>
                <div className="neu-inset-sm p-3">
                  <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Estado</div>
                  <div className="font-medium text-sm">
                    <span className={`neu-badge ${selectedTransaction.status === 'completed' ? 'text-success' :
                      selectedTransaction.status === 'pending' ? 'text-warning' : 'text-danger'
                      }`}>
                      {selectedTransaction.status === 'completed' ? 'Completada' :
                       selectedTransaction.status === 'pending' ? 'Pendiente' :
                       selectedTransaction.status === 'voided' ? 'Anulada' :
                       selectedTransaction.status === 'cancelled' ? 'Cancelada' :
                       selectedTransaction.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm border-b pb-2 uppercase tracking-wide text-muted-foreground">Productos vendidos</h4>
                {loadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="text-sm text-muted-foreground">Cargando artículos...</p>
                  </div>
                ) : (
                  <div className="table-to-cards">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-left">
                          <th className="pb-2">Producto</th>
                          <th className="pb-2 text-center">Cant.</th>
                          <th className="pb-2 text-right">Precio</th>
                          <th className="pb-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactionItems.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-muted-foreground">
                              No se encontraron artículos para esta venta.
                            </td>
                          </tr>
                        ) : (
                          transactionItems.map((item) => (
                            <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/50">
                              <td className="py-3" data-label="Producto">
                                <div className="font-medium">{item.products?.name || 'Producto desconocido'}</div>
                                <div className="text-xs text-muted-foreground">{item.products?.sku || '-'}</div>
                              </td>
                              <td className="py-3 text-center" data-label="Cant.">{item.quantity}</td>
                              <td className="py-3 text-right" data-label="Precio">${item.price_at_sale.toFixed(2)}</td>
                              <td className="py-3 text-right font-bold" data-label="Subtotal">
                                ${(item.quantity * item.price_at_sale).toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Totals */}
              {!loadingDetails && (
                <div className="mt-6 space-y-2 border-t pt-4 max-w-[280px] ml-auto">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-medium">${selectedTransaction.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedTransaction.discount_value > 0 && (
                    <div className="flex justify-between text-sm text-success font-bold">
                      <span>Descuento:</span>
                      <span>
                        -{selectedTransaction.discount_type === 'fixed' ? '$' : ''}
                        {selectedTransaction.discount_value}
                        {selectedTransaction.discount_type === 'percentage' ? '%' : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-xl pt-2 border-t border-border text-primary">
                    <span>Total:</span>
                    <span>${selectedTransaction.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedTransaction(null)}
                className="neu-btn neu-btn-primary px-8 font-bold"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
