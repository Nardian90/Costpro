'use client';

import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { useAuthStore, useCartStore, useUIStore, useCanAccess } from '@/store';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseUrl, getProductImageUrl, getStoreLogoUrl } from '@/lib/utils';
import ProductCard from '@/components/ProductCard';
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
  Loader2,
  Download,
  Upload,
  Filter,
  Bell,
  TrendingUp,
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
  FileText,
  Calendar,
  Layers,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import CostProLogo from '@/components/CostProLogo';
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
  Transaction,
  PaymentMethod,
  DiscountType,
  DashboardKPIs,
  SalesSummary,
  AuditLog,
  Store,
  Profile,
} from '@/types';
import { toast } from 'sonner';
import WarehouseView from '@/components/WarehouseView';
import InventoryCountView from '@/components/InventoryCountView';
import CostSheetsPage from '@/app/cost-sheets/page';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import SearchBar from '@/components/ui/SearchBar';

export default function TerminalView() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth(); // Sync Supabase session with store
  const logout = useAuthStore((state) => state.logout);
  const { setTheme, theme } = useTheme();
  const {
    sidebarOpen,
    toggleSidebar,
    currentView,
    setCurrentView,
    notifications,
    setNotifications,
    setSidebarOpen,
  } = useUIStore();
  const { items, addItem, removeItem, updateQuantity, clearCart, setDiscount, getTotal, getSubtotal, getItemCount, discount } = useCartStore();
  const isMobile = useIsMobile();
  const canViewFinancials = useCanAccess('warehouse'); // Using warehouse as a proxy for manager/admin financial view
  const [showCart, setShowCart] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<(Product & { product_variants?: any[] })[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [cashClosures, setCashClosures] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

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

  // Initial data fetch - only essential data for the default view (dashboard/pos)
  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchProducts();
    }
  }, [user]);

  // Lazy load data for other views only when they are requested
  useEffect(() => {
    if (!user) return;

    switch (currentView) {
      case 'sales':
        if (transactions.length === 0) fetchTransactions();
        break;
      case 'users':
        if (users.length === 0) fetchUsers();
        break;
      case 'stores':
        if (stores.length === 0) fetchStores();
        break;
      case 'audit':
        if (auditLogs.length === 0) fetchAuditLogs();
        break;
      case 'history':
        if (movements.length === 0) fetchMovements();
        break;
      case 'cash':
        if (cashClosures.length === 0) {
          fetchCashClosures();
        }
        break;
    }
  }, [user, currentView]);

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
          public_image_url: getSupabaseUrl('product-images', item.image_url),
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
    if (!user || (user.role !== 'admin' && user.role !== 'encargado')) return;
    try {
      let query = supabase.from('profiles').select('*');

      if (user.role === 'encargado') {
        query = query.eq('created_by', user.id);
      }

      const { data, error } = await query.order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchStores = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'encargado')) return;
    try {
      let query;
      if (user.role === 'admin') {
        query = supabase.from('stores').select('*').order('name');
      } else {
        // Fetch stores the user has access to
        query = supabase
          .from('stores')
          .select(`
            *,
            user_store_access!inner(user_id)
          `)
          .eq('user_store_access.user_id', user.id)
          .order('name');
      }

      const { data, error } = await query;
      if (error) throw error;
      setStores(data || []);
    } catch (error) {
      console.error('Error fetching stores:', error);
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


  const handleUpdateStoreLogo = async (file: File) => {
    if (!editingStore) return;
    if (file.size > 1 * 1024 * 1024) { // 1MB limit
      toast.error('El logo no debe superar 1MB');
      return;
    }

    const toastId = toast.loading('Subiendo logo...');
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${editingStore.id}-${Date.now()}.${fileExt}`;

      // Upload to 'store-logos' bucket
      const { error: uploadError } = await supabase.storage
        .from('store-logos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true, // Overwrite if exists for the same store
        });

      if (uploadError) throw uploadError;

      // Update the store's logo_url
      const { error: updateError } = await supabase
        .from('stores')
        .update({ logo_url: fileName })
        .eq('id', editingStore.id);

      if (updateError) throw updateError;

      toast.success('Logo actualizado', { id: toastId });
      setEditingStore({ ...editingStore, logo_url: fileName });
      fetchStores(); // Refresh stores list
    } catch (error: any) {
      toast.error(error.message || 'Error al subir el logo', { id: toastId });
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
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isVariantsModalOpen, setIsVariantsModalOpen] = useState(false);
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newVariantForm, setNewVariantForm] = useState({ name: '', price: 0, conversion_factor: 1 });
  const [isEditStoreModalOpen, setIsEditStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [userStoreAccess, setUserStoreAccess] = useState<{store_id: string, roles: UserRole[]}[]>([]);
  const [isDeleteStoreModalOpen, setIsDeleteStoreModalOpen] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [isCreateStoreModalOpen, setIsCreateStoreModalOpen] = useState(false);
  const [newStore, setNewStore] = useState({ name: '', address: '' });
  const [newStoreLogo, setNewStoreLogo] = useState<File | null>(null);
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'clerk' });

  const [localDiscount, setLocalDiscount] = useState({ type: 'fixed' as DiscountType, value: 0 });
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');

  // Transaction details state
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [transactionItems, setTransactionItems] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filter states for refined views
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

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
    const lowerSearch = deferredSearchTerm.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(lowerSearch) ||
      (p.sku && p.sku.toLowerCase().includes(lowerSearch)) ||
      (p.category && p.category.toLowerCase().includes(lowerSearch))
    );
  }, [products, deferredSearchTerm]);

  const filteredMovements = useMemo(() => {
    return movements.filter(mov => {
      const matchesSearch = !searchTerm ||
        mov.product?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mov.product?.sku?.toLowerCase().includes(searchTerm.toLowerCase());

      const movDate = new Date(mov.created_at);
      const fromDate = dateRange.from ? new Date(dateRange.from) : null;
      const toDate = dateRange.to ? new Date(dateRange.to) : null;

      if (fromDate && movDate < fromDate) return false;
      if (toDate && movDate > toDate) return false;
      return matchesSearch;
    });
  }, [movements, dateRange, searchTerm]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const matchesSearch = !searchTerm ||
        log.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase());

      const logDate = new Date(log.created_at);
      const fromDate = dateRange.from ? new Date(dateRange.from) : null;
      const toDate = dateRange.to ? new Date(dateRange.to) : null;

      if (fromDate && logDate < fromDate) return false;
      if (toDate && logDate > toDate) return false;
      return matchesSearch;
    });
  }, [auditLogs, dateRange, searchTerm]);

  const filteredUsers = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return users.filter(u =>
      u.full_name?.toLowerCase().includes(lowerSearch) ||
      u.email.toLowerCase().includes(lowerSearch) ||
      u.role.toLowerCase().includes(lowerSearch)
    );
  }, [users, searchTerm]);

  const filteredStores = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return stores.filter(s =>
      s.name.toLowerCase().includes(lowerSearch) ||
      s.address?.toLowerCase().includes(lowerSearch)
    );
  }, [stores, searchTerm]);

  const filteredTransactions = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return transactions.filter(t => {
      const matchesText = t.id.toLowerCase().includes(lowerSearch) ||
        t.total_amount.toString().includes(lowerSearch);
      const matchesStatus = !selectedStatus || t.status === selectedStatus;
      return matchesText && matchesStatus;
    });
  }, [transactions, searchTerm, selectedStatus]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard shortcuts for POS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search on '/' key only if not in an input and we are in POS view
      if (e.key === '/' &&
          (e.target as HTMLElement).tagName !== 'INPUT' &&
          (e.target as HTMLElement).tagName !== 'TEXTAREA' &&
          currentView === 'pos') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView]);

  // Performance: Memoize addToCart with useCallback to prevent re-creating the function on every render.
  // This is crucial because it's passed as a prop to the memoized ProductCard component,
  // preventing unnecessary re-renders of the entire product list when the parent state changes.
  const addToCart = useCallback((product: Product) => {
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
  }, [addItem]);

  if (loading || showSplash) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <CostProLogo size={160} />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleCheckout = async () => {
    if (items.length === 0 || isProcessing) return;
    if (!user || !user.store_id) {
      toast.error('No se pudo identificar la tienda del usuario');
      return;
    }

    setIsProcessing(true);
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
    } finally {
      setIsProcessing(false);
    }
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

  const handleUpdateStore = async () => {
    if (!editingStore) return;
    try {
      const { error } = await supabase
        .from('stores')
        .update({
          name: editingStore.name,
          address: editingStore.address,
        })
        .eq('id', editingStore.id);

      if (error) throw error;

      toast.success('Tienda actualizada con éxito');
      setIsEditStoreModalOpen(false);
      fetchStores();
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar la tienda');
    }
  };

  const handleCreateStore = async () => {
    const toastId = toast.loading('Creando tienda...');
    try {
      // Step 1: Create the store record
      const { data: storeData, error: createError } = await supabase
        .from('stores')
        .insert([{ name: newStore.name, address: newStore.address }])
        .select()
        .single();

      if (createError) throw createError;

      // Step 2: If a logo is selected, upload it
      if (newStoreLogo) {
        const fileExt = newStoreLogo.name.split('.').pop();
        const fileName = `${storeData.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('store-logos')
          .upload(fileName, newStoreLogo, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          toast.warning('Tienda creada, pero falló la subida del logo. Puede agregarlo editando la tienda.');
        } else {
          // Step 3: Update the store record with the logo URL
          const { error: updateError } = await supabase
            .from('stores')
            .update({ logo_url: fileName })
            .eq('id', storeData.id);

          if (updateError) {
            toast.warning('Tienda creada, pero no se pudo guardar el logo. Intente de nuevo editando la tienda.');
          }
        }
      }

      toast.success('Tienda creada con éxito', { id: toastId });
      setIsCreateStoreModalOpen(false);
      setNewStore({ name: '', address: '' });
      setNewStoreLogo(null);
      fetchStores();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear la tienda', { id: toastId });
    }
  };

  const handleDeleteStore = async () => {
    if (!deletingStore) return;
    try {
      const { error } = await supabase
        .from('stores')
        .delete()
        .eq('id', deletingStore.id);

      if (error) throw error;

      toast.success('Tienda eliminada con éxito');
      setIsDeleteStoreModalOpen(false);
      fetchStores();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar la tienda');
    }
  };

  const fetchUserStoreAccess = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_store_access')
        .select('store_id, roles')
        .eq('user_id', userId);

      if (error) {
        if (error.code === '42703') {
          console.warn('Database schema mismatch: column "roles" not found in user_store_access. Ensure migrations are applied.');
          // Fallback if possible or just set empty
          setUserStoreAccess([]);
          return;
        }
        throw error;
      }

      setUserStoreAccess(data.map(d => ({
        store_id: d.store_id,
        roles: Array.isArray(d.roles) ? d.roles as UserRole[] : ['clerk' as UserRole]
      })));
    } catch (error) {
      console.error('Error fetching user store access:', error);
      toast.error('Error al cargar accesos de tienda');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: editingUser.full_name,
          role: editingUser.role,
          max_stores_limit: editingUser.max_stores_limit,
          max_users_limit: editingUser.max_users_limit,
        })
        .eq('id', editingUser.id);

      if (profileError) throw profileError;

      // Update store access
      // 1. Delete old access
      const { error: deleteError } = await supabase
        .from('user_store_access')
        .delete()
        .eq('user_id', editingUser.id);

      if (deleteError) throw deleteError;

      // 2. Insert new access
      if (userStoreAccess.length > 0) {
        const { error: insertError } = await supabase
          .from('user_store_access')
          .insert(userStoreAccess.map(access => ({
            user_id: editingUser.id,
            store_id: access.store_id,
            roles: access.roles,
            assigned_by: user!.id
          })));
        if (insertError) throw insertError;
      }

      toast.success('Usuario actualizado con éxito');
      setIsEditUserModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar el usuario');
    }
  };

  const handleCreateUser = async () => {
    try {
      // In a real world, this would use an edge function to handle the creation and assignments
      // But here we'll try to use the auth.signUp and let the triggers handle the profile creation if possible
      // However, we need to assign stores too.

      const { data, error } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            full_name: newUser.full_name,
            role: newUser.role,
            created_by: user!.id // Pass who created it
          },
        },
      });

      if (error) throw error;

      const newUserId = data.user?.id;
      if (newUserId && userStoreAccess.length > 0) {
        // Wait a bit for the profile to be created by trigger
        await new Promise(resolve => setTimeout(resolve, 1000));

        const { error: accessError } = await supabase
          .from('user_store_access')
          .insert(userStoreAccess.map(access => ({
            user_id: newUserId,
            store_id: access.store_id,
            roles: access.roles,
            assigned_by: user!.id
          })));

        if (accessError) {
          toast.warning('Usuario creado pero hubo error al asignar tiendas');
        }
      }

      toast.success('Usuario creado con éxito');
      setIsCreateUserModalOpen(false);
      setNewUser({ full_name: '', email: '', password: '', role: 'clerk' });
      setUserStoreAccess([]);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear el usuario');
    }
  };

  const handleSetActiveStore = async (storeId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ active_store_id: storeId })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Tienda activa actualizada');

      // Update local store state
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) {
        useAuthStore.getState().updateUser({
          active_store_id: profileData.active_store_id,
          store_id: profileData.active_store_id
        });
      }

      // Refresh data for the new store context
      fetchProducts();
      fetchDashboardData();
      fetchTransactions();
      fetchMovements();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar de tienda');
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
    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];

    const items = [
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard', roles: ['admin', 'manager', 'clerk', 'encargado'] },
      { id: 'pos', icon: ShoppingCart, label: 'Punto de Venta', roles: ['clerk', 'manager', 'admin', 'encargado'] },
      { id: 'inventory', icon: Package, label: 'Inventario', roles: ['admin', 'manager', 'warehouse', 'encargado'] },
      { id: 'recepcion', icon: Warehouse, label: 'Recepciones', roles: ['warehouse', 'manager', 'encargado'] },
      { id: 'sales', icon: Receipt, label: 'Mis Ventas', roles: ['clerk', 'manager', 'encargado'] },
      { id: 'inventory_count', icon: ClipboardList, label: 'Conteo Inventario', roles: ['clerk', 'manager', 'admin', 'encargado'] },
      { id: 'cost-sheets', icon: FileText, label: 'Fichas de Costo', roles: ['admin', 'manager', 'encargado'] },
      { id: 'catalog', icon: Package, label: 'Catálogo', roles: ['manager', 'admin', 'encargado'] },
      { id: 'history', icon: History, label: 'Historial', roles: ['manager', 'admin', 'encargado'] },
      { id: 'audit', icon: Shield, label: 'Auditoría', roles: ['manager', 'admin', 'encargado'] },
      { id: 'cash', icon: DollarSign, label: 'Cierre Caja', roles: ['manager', 'admin', 'encargado'] },
      { id: 'users', icon: Users, label: 'Usuarios', roles: ['admin', 'encargado'] },
      { id: 'stores', icon: Building, label: 'Tiendas', roles: ['admin', 'encargado'] },
      { id: 'settings', icon: Settings, label: 'Configuración', roles: ['admin', 'manager', 'encargado'] },
    ];

    return items.filter(item => item.roles.some(r => userRoles.includes(r as UserRole)));
  };

  // ==================== VIEWS ====================

  const renderDashboard = () => (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, filter: 'blur(4px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-black text-primary font-mono tracking-tighter">DASHBOARD</h2>
        <div className="neu-badge !text-primary !bg-primary/10 border border-primary/20 flex items-center gap-2 py-1.5">
          <Calendar className="w-3 h-3" />
          Hoy: {new Date().toLocaleDateString()}
        </div>
      </div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1
            }
          }
        }}
        initial="hidden"
        animate="show"
      >
        {/* KPI Cards */}
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-1 neu-card !p-6 border border-white/5 bg-gradient-to-br from-background to-background/50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ventas Totales</span>
            <div className="p-2 bg-green-500/10 rounded-xl">
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
          </div>
          <div className="text-4xl font-black text-foreground drop-shadow-sm">${dashboardKPIs.gross_sales.toFixed(2)}</div>
          <div className="text-[10px] font-bold text-green-500 mt-2 uppercase tracking-widest">+12% vs ayer</div>
        </motion.div>

        {canViewFinancials && (
          <>
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-1 neu-card !p-6 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Costo de Ventas</span>
                <div className="p-2 bg-warning/10 rounded-xl">
                  <Target className="w-5 h-5 text-warning" />
                </div>
              </div>
              <div className="text-4xl font-black text-foreground">${dashboardKPIs.cost_of_goods.toFixed(2)}</div>
              <div className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">Margen: {((dashboardKPIs.profit / dashboardKPIs.gross_sales) * 100 || 0).toFixed(1)}%</div>
            </motion.div>

            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-1 neu-card !p-6 border border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-primary">Utilidad Neta</span>
                <div className="p-2 bg-primary/20 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="text-4xl font-black text-primary">${dashboardKPIs.profit.toFixed(2)}</div>
              <div className="text-[10px] font-black text-primary/70 mt-2 uppercase tracking-widest">Utilidad Diaria</div>
            </motion.div>
          </>
        )}

        {/* Additional Stats */}
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-2 neu-card !p-6 border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Resumen de Ventas
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { label: 'Transacciones', value: salesSummary.transaction_count, sub: 'Hoy' },
              { label: 'Ticket Promedio', value: `$${salesSummary.average_ticket.toFixed(2)}`, sub: 'ARS' },
              { label: 'Efectivo', value: `$${salesSummary.total_cash.toFixed(2)}`, sub: 'Recaudado', color: 'text-green-500' },
              { label: 'Transferencia', value: `$${salesSummary.total_transfer.toFixed(2)}`, sub: 'Banco', color: 'text-primary' },
            ].map((stat, i) => (
              <div key={i} className="neu-inset-sm !p-4 bg-background/50 border border-white/5">
                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter block mb-1">{stat.label}</span>
                <div className={cn("text-xl font-black tracking-tight", stat.color || "text-foreground")}>{stat.value}</div>
                <span className="text-[8px] font-bold text-muted-foreground/50 uppercase">{stat.sub}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-1 neu-card !p-6 border border-danger/10">
          <h3 className="text-lg font-black text-danger uppercase tracking-widest flex items-center gap-2 mb-6">
            <Package className="w-5 h-5" />
            Alertas Críticas
          </h3>
          <div className="space-y-3">
            {products.filter(p => p.stock_current <= p.min_stock).slice(0, 4).map(product => (
              <div key={product.id} className="neu-raised-sm !p-3 bg-danger/5 border border-danger/10 group hover:bg-danger/10 transition-colors">
                <div className="flex justify-between items-center">
                  <div className="overflow-hidden">
                    <div className="font-bold text-xs text-foreground truncate">{product.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{product.sku}</div>
                  </div>
                  <div className="text-danger font-black text-sm whitespace-nowrap ml-2">{product.stock_current} uds</div>
                </div>
              </div>
            ))}
            {products.filter(p => p.stock_current <= p.min_stock).length === 0 && (
              <div className="text-center py-10">
                <Check className="w-12 h-12 mx-auto mb-2 text-success opacity-20" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Todo en orden</p>
              </div>
            )}
            {products.filter(p => p.stock_current <= p.min_stock).length > 4 && (
              <button onClick={() => setCurrentView('inventory')} className="w-full py-2 text-[10px] font-black uppercase text-primary hover:underline">
                Ver todas las alertas ({products.filter(p => p.stock_current <= p.min_stock).length})
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );

  const renderPOS = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Punto de Venta</h2>
        <ActionMenu
          actions={[
            {
              id: 'cart',
              label: `Carrito (${getItemCount()})`,
              icon: ShoppingCart,
              onClick: () => setShowCart(!showCart),
              variant: getItemCount() > 0 ? 'primary' : 'outline',
              active: showCart
            }
          ]}
          className="sm:w-auto"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Product Grid */}
        <div className="flex-1 w-full space-y-6">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar productos por nombre, SKU o categoría..."
            showSettings={true}
          >
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase mb-1 block">Categoría</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="neu-input w-full"
                  >
                    <option value="">Todas las categorías</option>
                    {[...new Set(products.map(p => p.category))].map(category => (
                      <option key={category} value={category || ''}>{category}</option>
                    ))}
                  </select>
                </div>
             </div>
          </SearchBar>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.length > 0 ? (
              filteredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={addToCart}
                />
              ))
            ) : (
              <div className="col-span-full py-32 text-center neu-card border-2 border-dashed border-white/5">
                <Search className="w-16 h-16 mx-auto mb-6 opacity-5" />
                <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Sin resultados</p>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="mt-6 text-primary font-black uppercase text-xs hover:underline tracking-[0.2em]"
                  >
                    Ver Todo el Catálogo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cart Panel */}
        <AnimatePresence>
          {showCart && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="w-full lg:w-[400px] shrink-0 sticky top-24 z-20"
            >
              <div className="neu-card !p-0 overflow-hidden border border-primary/20 shadow-2xl bg-background/95 backdrop-blur-md">
                <div className="bg-primary p-6 flex items-center justify-between text-white">
                  <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3">
                    <ShoppingCart className="w-6 h-6" />
                    Caja Registradora
                  </h3>
                  <button onClick={() => setShowCart(false)} className="p-2 hover:bg-white/10 rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-6">
                  {items.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      <ShoppingCart className="w-20 h-20 mx-auto mb-6 opacity-5" />
                      <p className="font-black uppercase tracking-widest text-sm">Tu carrito está vacío</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 mb-8 no-scrollbar">
                        {items.map(item => (
                          <div key={`${item.product_id}-${item.variant_id}`} className="neu-raised-sm !p-4 border border-white/5 group relative">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex-1">
                                <div className="font-black text-sm uppercase tracking-tight truncate pr-6">{item.product.name}</div>
                                <div className="text-[10px] font-bold text-muted-foreground mt-1">${item.price.toFixed(2)} / unidad</div>
                              </div>
                              <button
                                onClick={() => removeItem(item.product_id, item.variant_id)}
                                className="absolute top-2 right-2 text-muted-foreground hover:text-danger p-2 rounded-full hover:bg-danger/5 transition-all"
                                aria-label="Eliminar del carrito"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1 bg-background/50 rounded-xl p-1 border border-white/5">
                                <button
                                  onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-colors active:scale-90"
                                  aria-label="Disminuir cantidad"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-10 text-center font-black text-sm">{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-colors active:scale-90"
                                  aria-label="Aumentar cantidad"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                              <span className="font-black text-lg text-primary">${item.subtotal.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Discount & Payment Info omitted for brevity but should follow same style */}
                      <div className="space-y-6 pt-6 border-t border-white/5">
                        <div className="flex justify-between items-center px-2">
                           <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">Total a Pagar</span>
                           <span className="text-4xl font-black text-primary tracking-tighter">${getTotal().toFixed(2)}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <button
                            onClick={() => setSelectedPayment('cash')}
                            className={cn(
                              "neu-raised-sm !p-4 flex flex-col items-center gap-2 border-2 transition-all",
                              selectedPayment === 'cash' ? "border-primary bg-primary/5 shadow-primary/20" : "border-transparent"
                            )}
                           >
                             <DollarSign className={cn("w-6 h-6", selectedPayment === 'cash' ? "text-primary" : "text-muted-foreground")} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Efectivo</span>
                           </button>
                           <button
                            onClick={() => setSelectedPayment('transfer')}
                            className={cn(
                              "neu-raised-sm !p-4 flex flex-col items-center gap-2 border-2 transition-all",
                              selectedPayment === 'transfer' ? "border-primary bg-primary/5 shadow-primary/20" : "border-transparent"
                            )}
                           >
                             <CreditCard className={cn("w-6 h-6", selectedPayment === 'transfer' ? "text-primary" : "text-muted-foreground")} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Transferencia</span>
                           </button>
                        </div>

                        <button
                          onClick={handleCheckout}
                          disabled={isProcessing || items.length === 0}
                          className="neu-btn-primary !py-5 w-full flex items-center justify-center gap-3 font-black text-lg shadow-2xl disabled:opacity-50"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                          ) : (
                            <Check className="w-6 h-6" />
                          )}
                          {isProcessing ? 'PROCESANDO...' : 'FINALIZAR VENTA'}
                        </button>

                        <button
                          onClick={() => {
                            toast("¿Anular el carrito?", {
                              description: "Se removerán todos los productos seleccionados.",
                              action: {
                                label: "Sí, anular",
                                onClick: () => {
                                  clearCart();
                                  setShowCart(false);
                                  toast.success("Carrito anulado");
                                }
                              },
                              cancel: {
                                label: "Cancelar",
                                onClick: () => {}
                              }
                            });
                          }}
                          className="w-full py-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-danger transition-colors"
                        >
                          Anular Carrito
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const renderSales = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Historial de Ventas</h2>

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Buscar por ID de transacción o monto..."
      >
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase mb-1 block">Estado</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="neu-input w-full"
              >
                <option value="">Todos los estados</option>
                <option value="completed">Completada</option>
                <option value="pending">Pendiente</option>
                <option value="voided">Anulada</option>
              </select>
            </div>
         </div>
      </SearchBar>

      <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
              <th className="p-4 text-left">Referencia</th>
              <th className="p-4 text-left">Fecha / Hora</th>
              <th className="p-4 text-left">Método</th>
              <th className="p-4 text-right">Monto Total</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center">Detalle</th>
            </tr>
          </thead>
          <tbody className="bg-background/30 backdrop-blur-sm">
            {filteredTransactions.map(txn => (
              <tr key={txn.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors">
                <td data-label="ID" className="p-4 font-black text-xs text-primary">{txn.id.split('-')[0]}</td>
                <td data-label="Fecha" className="p-4">
                  <div className="text-sm font-bold">{new Date(txn.created_at).toLocaleDateString()}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{new Date(txn.created_at).toLocaleTimeString()}</div>
                </td>
                <td data-label="Método" className="p-4">
                  <div className="flex items-center gap-2">
                    {txn.payment_method === 'cash' ? <DollarSign className="w-3 h-3 text-green-500" /> : <CreditCard className="w-3 h-3 text-primary" />}
                    <span className="text-xs font-bold uppercase tracking-widest">{txn.payment_method}</span>
                  </div>
                </td>
                <td data-label="Total" className="p-4 text-right">
                  <span className="text-lg font-black text-foreground">${txn.total_amount.toFixed(2)}</span>
                </td>
                <td data-label="Estado" className="p-4 text-center">
                  <span className={cn(
                    "neu-badge !text-[9px] px-2 py-0.5",
                    txn.status === 'completed' ? "text-success" :
                    txn.status === 'pending' ? "text-warning" : "text-danger"
                  )}>
                    {txn.status}
                  </span>
                </td>
                <td data-label="Detalle" className="p-4">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => fetchTransactionDetails(txn)}
                      className="neu-raised-sm w-9 h-9 flex items-center justify-center hover:text-primary transition-all active:scale-90"
                      aria-label="Ver detalle de venta"
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

  const renderHistory = () => {
    const getMovementBadge = (type: string) => {
      switch (type) {
        case 'sale': return 'text-primary bg-primary/10 border-primary/20';
        case 'purchase': return 'text-success bg-success/10 border-success/20';
        case 'adjustment': return 'text-warning bg-warning/10 border-warning/20';
        default: return 'text-muted-foreground bg-accent/20 border-white/5';
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
           <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Movimientos de Stock</h2>
           <ActionMenu
            actions={[
              { id: 'refresh', label: 'Actualizar', icon: History, onClick: fetchMovements, variant: 'primary' }
            ]}
            className="sm:w-auto"
           />
        </div>

        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Filtrar por nombre de producto o SKU..."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Fecha Desde</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  className="neu-input w-full pl-10"
                  value={dateRange.from}
                  onChange={e => setDateRange({ ...dateRange, from: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Fecha Hasta</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  className="neu-input w-full pl-10"
                  value={dateRange.to}
                  onChange={e => setDateRange({ ...dateRange, to: e.target.value })}
                />
              </div>
            </div>
          </div>
        </SearchBar>

        <div className="space-y-4">
          {filteredMovements.map(mov => (
            <div key={mov.id} className="neu-card !p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border border-white/5 group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-5">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border-2 shadow-inner group-hover:scale-110 transition-transform", getMovementBadge(mov.movement_type))}>
                  {mov.movement_type === 'sale' ? <ArrowUpRight className="w-7 h-7" /> :
                   mov.movement_type === 'purchase' ? <ArrowDownRight className="w-7 h-7" /> :
                   <ArrowUpDown className="w-7 h-7" />}
                </div>
                <div>
                  <div className="font-black text-lg uppercase tracking-tight leading-tight">{mov.product?.name}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="font-mono text-[10px] font-bold text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded tracking-tighter">{mov.product?.sku}</span>
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest">{mov.movement_type}</span>
                  </div>
                </div>
              </div>
              <div className="text-left sm:text-right space-y-1">
                <div className={cn("text-2xl font-black drop-shadow-sm", mov.quantity_change > 0 ? 'text-success' : 'text-danger')}>
                  {mov.quantity_change > 0 ? '+' : ''}{mov.quantity_change}
                  <span className="text-xs ml-1 font-bold">uds</span>
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                  {new Date(mov.created_at).toLocaleString()}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground/60 italic">
                  REF: {mov.reference_doc || 'N/A'}
                </div>
              </div>
            </div>
          ))}
          {filteredMovements.length === 0 && (
            <div className="text-center py-32 text-muted-foreground neu-card border-2 border-dashed border-white/5">
              <History className="w-16 h-16 mx-auto mb-6 opacity-5" />
              <p className="font-black uppercase tracking-widest">No se encontraron movimientos</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAudit = () => (
    <div className="space-y-6">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Logs de Auditoría</h2>

        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar logs por tabla o acción..."
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Rango de Fechas</label>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="date"
                            className="neu-input w-full text-xs"
                            value={dateRange.from}
                            onChange={e => setDateRange({ ...dateRange, from: e.target.value })}
                        />
                        <input
                            type="date"
                            className="neu-input w-full text-xs"
                            value={dateRange.to}
                            onChange={e => setDateRange({ ...dateRange, to: e.target.value })}
                        />
                    </div>
                </div>
            </div>
        </SearchBar>

        <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
                        <th className="p-4 text-left">Fecha / Hora</th>
                        <th className="p-4 text-left">Operador</th>
                        <th className="p-4 text-left">Operación</th>
                        <th className="p-4 text-left">Recurso</th>
                        <th className="p-4 text-left">Identificador</th>
                    </tr>
                </thead>
                <tbody className="bg-background/30">
                    {filteredLogs.map((log) => (
                        <tr key={log.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors">
                            <td data-label="Fecha" className="p-4">
                              <div className="font-bold text-sm">{new Date(log.created_at).toLocaleDateString()}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{new Date(log.created_at).toLocaleTimeString()}</div>
                            </td>
                            <td data-label="Usuario" className="p-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black border border-primary/20">
                                  {((log as any).profile?.full_name || 'S')?.charAt(0)}
                                </div>
                                <div className="font-bold text-xs">{(log as any).profile?.full_name || 'Sistema'}</div>
                              </div>
                            </td>
                            <td data-label="Acción" className="p-4">
                                <span className={cn(
                                    "neu-badge !text-[9px] px-2 py-0.5 font-black",
                                    ['INSERT', 'CREATE', 'ADD'].includes(log.action) ? 'text-success bg-success/10' :
                                    ['UPDATE', 'EDIT'].includes(log.action) ? 'text-warning bg-warning/10' : 'text-danger bg-danger/10'
                                )}>
                                    {log.action}
                                </span>
                            </td>
                            <td data-label="Tabla" className="p-4">
                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-muted/20 px-1.5 py-0.5 rounded">{log.table_name}</span>
                            </td>
                            <td data-label="Detalles" className="p-4 font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
                                {log.record_id}
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
      <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Catálogo Global</h2>

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Buscar en el catálogo..."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredProducts.map(product => (
          <div key={product.id} className="neu-card !p-6 border border-white/5 hover:border-primary/20 transition-all group">
            <div className="neu-raised-sm w-full h-48 mb-6 flex items-center justify-center overflow-hidden rounded-2xl bg-background/50">
              {product.public_image_url ? (
                <img src={product.public_image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              ) : (
                <Package className="w-12 h-12 text-muted-foreground opacity-20" />
              )}
            </div>

            <h3 className="font-black text-lg uppercase tracking-tight mb-2 truncate">{product.name}</h3>
            <p className="text-xs text-muted-foreground mb-4 line-clamp-2 min-h-[32px]">{product.description || 'Sin descripción disponible'}</p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="neu-inset-sm !p-3 text-center border border-white/5">
                <div className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mb-1">Costo Unit.</div>
                <div className="font-bold text-sm text-foreground">${product.cost_price.toFixed(2)}</div>
              </div>
              <div className="neu-inset-sm !p-3 text-center border border-primary/10 bg-primary/5">
                <div className="text-[8px] font-black uppercase text-primary tracking-widest mb-1">Precio Venta</div>
                <div className="font-black text-sm text-primary">${product.price.toFixed(2)}</div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => { setEditingProduct(product); setIsEditProductModalOpen(true); }}
                className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm"
              >
                <Edit className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Info</span>
              </button>
              <button
                onClick={() => { setEditingProduct(product); setIsVariantsModalOpen(true); }}
                className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm"
              >
                <DollarSign className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Precios</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderCash = () => (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Cierre de Arqueo</h2>
        <ActionMenu
          actions={[
            { id: 'process', label: 'Procesar Cierre', icon: DollarSign, onClick: () => toast.info('Funcionalidad en desarrollo'), variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="neu-card !p-8 border border-white/5 space-y-8">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-xl"><Edit className="w-5 h-5 text-primary" /></div>
             <h3 className="font-black text-lg uppercase tracking-widest">Declaración de Fondos</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Efectivo Físico</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                <input type="number" className="neu-input w-full pl-12 text-2xl font-black font-mono" placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Otros Comprobantes</label>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                <input type="number" className="neu-input w-full pl-12 text-2xl font-black font-mono" placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Observaciones</label>
              <textarea className="neu-input w-full h-32 text-sm font-medium resize-none" placeholder="Notas del turno..." />
            </div>
          </div>
        </div>

        <div className="neu-card !p-8 border border-primary/20 bg-primary/5 space-y-8">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/20 rounded-xl"><Layers className="w-5 h-5 text-primary" /></div>
             <h3 className="font-black text-lg uppercase tracking-widest">Balance del Sistema</h3>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Ventas Totales Esperadas', value: salesSummary.total_billed, color: 'text-foreground' },
              { label: 'Efectivo Declarado (Sistema)', value: salesSummary.total_cash, color: 'text-green-500' },
              { label: 'Transferencias (Sistema)', value: salesSummary.total_transfer, color: 'text-primary' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center p-4 neu-inset-sm bg-background/50 border border-white/5">
                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{row.label}</span>
                <span className={cn("text-xl font-black font-mono", row.color)}>${row.value.toFixed(2)}</span>
              </div>
            ))}

            <div className="flex justify-between items-center p-6 neu-raised-sm bg-primary text-white mt-8 shadow-xl shadow-primary/20">
              <span className="text-xs font-black uppercase tracking-[0.2em]">Diferencia de Arqueo</span>
              <span className="text-3xl font-black font-mono">$0.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de Cierres */}
      <div className="neu-card !p-8 border border-white/5">
        <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3 mb-8">
          <History className="w-6 h-6 text-primary" />
          Registros de Cierre
        </h3>

        <div className="overflow-x-auto table-to-cards rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
                <th className="p-4 text-left">Fecha de Cierre</th>
                <th className="p-4 text-left">Operador</th>
                <th className="p-4 text-right">Monto Sistema</th>
                <th className="p-4 text-right">Desviación</th>
                <th className="p-4 text-center">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {cashClosures.map((closure) => (
                <tr key={closure.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors">
                  <td data-label="Fecha" className="p-4">
                    <div className="font-bold">{new Date(closure.created_at).toLocaleDateString()}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{new Date(closure.created_at).toLocaleTimeString()}</div>
                  </td>
                  <td data-label="Cajero" className="p-4 font-bold text-xs uppercase tracking-tight">{closure.profile?.full_name}</td>
                  <td data-label="Total Sistema" className="p-4 text-right font-black text-lg">${closure.system_expected_total?.toFixed(2) || closure.system_total?.toFixed(2)}</td>
                  <td data-label="Diferencia" className="p-4 text-right">
                    <span className={cn(
                      "font-black text-sm px-2 py-1 rounded-lg",
                      closure.difference < 0 ? 'text-danger bg-danger/5' : 'text-success bg-success/5'
                    )}>
                      ${closure.difference?.toFixed(2)}
                    </span>
                  </td>
                  <td data-label="Acciones" className="p-4">
                    <div className="flex justify-center">
                      <button className="neu-raised-sm w-9 h-9 flex items-center justify-center hover:text-primary transition-all active:scale-90" aria-label="Ver detalles">
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
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Gestión de Usuarios</h2>
        <ActionMenu
          actions={[
            { id: 'new', label: 'Nuevo Usuario', icon: Plus, onClick: () => setIsCreateUserModalOpen(true), variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar usuarios por nombre, email o rol..." />

      <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
              <th className="p-4 text-left">Perfil</th>
              <th className="p-4 text-left">Contacto</th>
              <th className="p-4 text-left">Nivel de Acceso</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-background/30">
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors">
                <td data-label="Usuario" className="p-4">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white flex items-center justify-center font-black text-sm shadow-lg shadow-primary/20">
                        {u.full_name?.charAt(0)}
                      </div>
                      <div className="font-black text-sm uppercase tracking-tight">{u.full_name}</div>
                   </div>
                </td>
                <td data-label="Email" className="p-4 font-mono text-xs text-muted-foreground">{u.email}</td>
                <td data-label="Rol" className="p-4">
                  <span className={cn(
                    "neu-badge !text-[9px] font-black px-2.5 py-0.5",
                    u.role === 'admin' ? 'text-primary bg-primary/10' :
                    (u.role === 'encargado' || u.role === 'manager') ? 'text-secondary bg-secondary/10' :
                    u.role === 'usuario' ? 'text-success bg-success/10' : 'text-muted-foreground bg-muted/10'
                  )}>
                    {u.role === 'manager' ? 'encargado' : u.role}
                  </span>
                </td>
                <td data-label="Estado" className="p-4 text-center">
                  <div className="flex justify-center">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      u.is_active ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-danger'
                    )} />
                    <span className="text-[10px] font-bold uppercase ml-2 text-muted-foreground">{u.is_active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                </td>
                <td data-label="Acciones" className="p-4">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setIsEditUserModalOpen(true);
                        fetchUserStoreAccess(u.id);
                      }}
                      className="neu-raised-sm w-9 h-9 flex items-center justify-center hover:text-primary transition-all active:scale-90"
                      aria-label="Editar"
                    >
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Red de Tiendas</h2>
        <ActionMenu
          actions={[
            { id: 'new', label: 'Nueva Sucursal', icon: Plus, onClick: () => setIsCreateStoreModalOpen(true), variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Filtrar por nombre de sucursal o ubicación..." />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
        {filteredStores.map((store) => (
          <div key={store.id} className="neu-card !p-6 group relative overflow-hidden border border-white/5 hover:border-primary/20 transition-all">
            <div className="flex items-start justify-between mb-8">
              <div className="neu-raised-sm w-16 h-16 flex items-center justify-center bg-background/50 rounded-2xl group-hover:scale-110 transition-transform">
                {store.logo_url ? (
                  <img src={getStoreLogoUrl(store)} alt={store.name} className="w-full h-full object-cover rounded-2xl" />
                ) : (
                  <Building className="w-8 h-8 text-primary opacity-40" />
                )}
              </div>
              <span className={cn(
                "neu-badge !text-[9px] px-2 py-0.5 font-black uppercase tracking-widest",
                store.is_active ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
              )}>
                {store.is_active ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <h3 className="font-black text-xl uppercase tracking-tighter leading-none mb-2">{store.name}</h3>
            <p className="text-xs font-bold text-muted-foreground leading-relaxed min-h-[40px] mb-8">{store.address || 'Ubicación no especificada'}</p>

            <div className="flex flex-col gap-3 pt-6 border-t border-white/5">
              {user?.active_store_id !== store.id ? (
                <button
                  onClick={() => handleSetActiveStore(store.id)}
                  className="neu-btn-primary !p-3 w-full flex items-center justify-center gap-2 shadow-lg shadow-primary/10"
                >
                  <Target className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Seleccionar Tienda</span>
                </button>
              ) : (
                <div className="neu-inset-sm !p-3 w-full flex items-center justify-center gap-2 bg-primary/5 border border-primary/20 rounded-xl">
                  <Check className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Tienda Actual</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setEditingStore(store); setIsEditStoreModalOpen(true); }}
                  className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm group/btn transition-all"
                >
                  <Edit className="w-4 h-4 group-hover/btn:text-primary transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Info</span>
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => { setDeletingStore(store); setIsDeleteStoreModalOpen(true); }}
                    className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm group/del transition-all"
                  >
                    <Trash2 className="w-4 h-4 group-hover/del:text-danger transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Borrar</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-10 max-w-4xl">
      <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Configuración Global</h2>

      <div className="space-y-8">
        <div className="neu-card !p-8 border border-white/5">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Sun className="w-5 h-5" />
            Interfaz y Estética
          </h3>

          <div className="neu-inset-sm bg-background/50 border border-white/5 rounded-2xl p-6">
            <div className="font-black text-sm uppercase tracking-tight mb-2">Tema de la Interfaz</div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest mb-4">Seleccione su esquema de color preferido</div>
            <div className="grid grid-cols-3 gap-4">
              <button onClick={() => setTheme('light')} className={`neu-raised-sm p-4 rounded-xl ${theme === 'light' ? 'ring-2 ring-primary' : ''}`}>Light</button>
              <button onClick={() => setTheme('dark')} className={`neu-raised-sm p-4 rounded-xl ${theme === 'dark' ? 'ring-2 ring-primary' : ''}`}>Dark</button>
              <button onClick={() => setTheme('neumo')} className={`neu-raised-sm p-4 rounded-xl ${theme === 'neumo' ? 'ring-2 ring-primary' : ''}`}>Neumo</button>
            </div>
          </div>
        </div>

        <div className="neu-card !p-8 border border-white/5">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Bell className="w-5 h-5" />
            Centro de Notificaciones
          </h3>

          <div className="space-y-4">
            {[
              { id: 'lowStock', label: 'Alertas de Stock Bajo', desc: 'Notificar interrupciones críticas en inventario', active: notifications.lowStock },
              { id: 'salesAlerts', label: 'Notificaciones de Venta', desc: 'Alertas en tiempo real por cada transacción', active: notifications.salesAlerts },
            ].map((notif) => (
              <div key={notif.id} className="flex items-center justify-between p-6 neu-inset-sm bg-background/50 border border-white/5 rounded-2xl">
                <div>
                  <div className="font-black text-sm uppercase tracking-tight">{notif.label}</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">{notif.desc}</div>
                </div>
                <button
                  onClick={() => setNotifications({ [notif.id]: !notif.active } as any)}
                  className={cn(
                    "neu-badge !py-2 !px-5 font-black uppercase tracking-widest transition-all cursor-pointer",
                    notif.active ? "text-success bg-success/10 border-success/20" : "text-muted-foreground bg-muted/20"
                  )}
                >
                  {notif.active ? 'Suscrito' : 'Desactivado'}
                </button>
              </div>
            ))}
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
      case 'cost-sheets': return <CostSheetsPage />;
      default: return renderDashboard();
    }
  };

  const getRoleLabel = (role: UserRole) => {
    const labels: Record<UserRole, string> = {
      admin: 'Administrador',
      encargado: 'Encargado',
      manager: 'Gestor',
      clerk: 'Cajero',
      warehouse: 'Almacén',
      usuario: 'Usuario',
    };
    return labels[role] || role;
  };

  const getActiveRolesLabel = () => {
    if (!user) return '';
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    return roles.map(r => getRoleLabel(r)).join(' + ');
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground max-w-full overflow-x-auto">
      {/* Sidebar */}
      <aside className={`w-64 lg:w-72 fixed lg:sticky top-0 h-screen z-40 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col border-r border-sidebar-border shadow-2xl">
          {/* Logo */}
          <div className="p-8 border-b border-sidebar-border/50">
            <CostProLogo size={50} animated={true} />
            <div className="mt-4">
              <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Terminal Operativa</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 no-scrollbar">
            <div className="space-y-2">
              {navigationItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id);
                    if (isMobile) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95",
                    currentView === item.id
                      ? "bg-primary text-white shadow-xl shadow-primary/20 font-black"
                      : "hover:bg-primary/5 text-sidebar-foreground/70 font-bold"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", currentView === item.id ? "text-white" : "group-hover:text-primary transition-colors")} />
                  <span className="text-xs uppercase tracking-widest">{item.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* User Info & Logout */}
          <div className="p-6 border-t border-sidebar-border/50">
            <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 shadow-inner mb-4">
              <div className="font-black text-xs text-primary uppercase tracking-widest truncate">{user?.full_name}</div>
              <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">
                {getActiveRolesLabel()}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-xs uppercase tracking-widest">Salir</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-background/80 backdrop-blur-xl p-4 sm:p-6 sticky top-0 z-30 border-b border-white/5 w-full">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 overflow-hidden">
              <button
                onClick={toggleSidebar}
                className="neu-raised-sm w-11 h-11 flex items-center justify-center lg:hidden shrink-0 active:scale-90 transition-transform"
                aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <div className="flex items-center gap-3 overflow-hidden">
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-primary whitespace-nowrap truncate max-w-[150px] sm:max-w-none">
                  {navigationItems.find(i => i.id === currentView)?.label || 'Dashboard'}
                </h1>
                <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />
                <p className="hidden sm:block text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] truncate">
                  {user?.full_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                className="neu-raised-sm w-11 h-11 flex items-center justify-center relative active:scale-90 transition-transform"
                aria-label="Alertas"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full animate-ping" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 sm:p-8 lg:p-12 pb-32 flex-1 overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="neu-card max-w-2xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300 shadow-2xl border-primary/20 !p-0 overflow-hidden bg-background">
            <div className="flex justify-between items-center p-8 border-b border-white/5 bg-primary/5">
              <div>
                <h3 className="text-2xl font-black text-primary uppercase tracking-tighter">Detalle de Operación</h3>
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">ID: {selectedTransaction.id}</p>
              </div>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="neu-raised-sm w-12 h-12 flex items-center justify-center hover:text-danger transition-colors active:scale-90"
                aria-label="Cerrar modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 no-scrollbar">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-10">
                {[
                  { label: 'Fecha de Emisión', value: new Date(selectedTransaction.created_at).toLocaleString(), icon: Calendar },
                  { label: 'Método de Cobro', value: selectedTransaction.payment_method, icon: CreditCard },
                  { label: 'Estado Transacción', value: selectedTransaction.status, icon: Shield, badge: true },
                ].map((item, i) => (
                  <div key={i} className="neu-inset-sm !p-4 bg-background/50 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                       <item.icon className="w-3 h-3 text-primary" />
                       <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</span>
                    </div>
                    <div className={cn(
                      "text-xs font-black uppercase tracking-tight",
                      item.badge ? "text-success" : "text-foreground"
                    )}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-[0.3em] text-primary border-b border-primary/20 pb-2 mb-6">Artículos de la Venta</h4>
                {loadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Sincronizando datos...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto table-to-cards rounded-2xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5 text-muted-foreground font-black uppercase text-[9px] tracking-widest text-left">
                          <th className="pb-4">Descripción</th>
                          <th className="pb-4 text-center">Cant.</th>
                          <th className="pb-4 text-right">Precio Unit.</th>
                          <th className="pb-4 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactionItems.map((item) => (
                          <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-4" data-label="Producto">
                              <div className="font-black text-xs uppercase">{item.products?.name}</div>
                              <div className="text-[9px] font-mono text-muted-foreground">{item.products?.sku}</div>
                            </td>
                            <td className="py-4 text-center font-bold" data-label="Cant.">{item.quantity}</td>
                            <td className="py-4 text-right font-bold" data-label="Precio">${item.price_at_sale.toFixed(2)}</td>
                            <td className="py-4 text-right font-black text-primary" data-label="Subtotal">
                              ${(item.quantity * item.price_at_sale).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {!loadingDetails && (
                <div className="mt-10 pt-8 border-t-2 border-white/5 flex justify-end">
                   <div className="w-full sm:w-64 space-y-3">
                      <div className="flex justify-between items-center px-2">
                         <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Subtotal Bruto</span>
                         <span className="font-bold text-sm">${selectedTransaction.subtotal.toFixed(2)}</span>
                      </div>
                      {selectedTransaction.discount_value > 0 && (
                        <div className="flex justify-between items-center px-2">
                           <span className="text-[10px] font-black uppercase text-success tracking-widest">Descuento Aplicado</span>
                           <span className="font-black text-success text-sm">-{selectedTransaction.discount_value}%</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center p-4 bg-primary text-white rounded-2xl shadow-xl shadow-primary/20">
                         <span className="text-xs font-black uppercase tracking-[0.2em]">Total Final</span>
                         <span className="text-2xl font-black font-mono">${selectedTransaction.total_amount.toFixed(2)}</span>
                      </div>
                   </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-muted/20 border-t border-white/5 flex justify-end">
              <button
                onClick={() => setSelectedTransaction(null)}
                className="neu-btn-primary !px-10 font-black text-xs uppercase tracking-[0.2em]"
              >
                Finalizar Revisión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs for modals like Edit/Create Product, Store, User omitted for brevity as they follow standard shadcn/ui but should use neu-input and neu-btn-primary where applicable */}
      {/* (The existing modals already used neu-input and neu-btn-primary mostly, I will maintain that) */}

      {/* Edit Product Modal */}
      <Dialog open={isEditProductModalOpen} onOpenChange={setIsEditProductModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Editar Información de Producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Nombre Comercial</label>
              <input
                type="text"
                value={editingProduct?.name || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                className="neu-input w-full font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Imagen del Producto</label>
              <div className="flex flex-col items-center gap-6 p-6 neu-inset-sm bg-background/50 rounded-3xl">
                <div className="neu-raised-sm w-40 h-40 flex items-center justify-center overflow-hidden rounded-3xl border-2 border-white/5">
                  {editingProduct?.image_url ? (
                    <img
                      src={getProductImageUrl(editingProduct.image_url) || ''}
                      alt={editingProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-16 h-16 text-muted-foreground opacity-20" />
                  )}
                </div>
                <input
                  type="file"
                  id="product-image-upload"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpdateImage(file);
                  }}
                />
                <label
                  htmlFor="product-image-upload"
                  className="neu-btn !px-8 text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-lg active:scale-95 transition-all"
                >
                  Subir Nueva Imagen
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <button
              onClick={() => setIsEditProductModalOpen(false)}
              className="neu-btn !py-3 flex-1 font-black text-xs uppercase tracking-widest"
            >
              Cerrar
            </button>
            <button
              onClick={handleUpdateProduct}
              className="neu-btn-primary !py-3 flex-1 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20"
            >
              Guardar Cambios
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Variants Modal */}
      <Dialog open={isVariantsModalOpen} onOpenChange={setIsVariantsModalOpen}>
        <DialogContent className="max-w-2xl !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Variantes de Precio - {editingProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-8 py-6">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b border-primary/20 pb-1">Variantes Activas</h4>
              <div className="space-y-3">
                {editingProduct?.product_variants?.map((v: any) => (
                  <div key={v.id} className="neu-raised-sm !p-4 flex justify-between items-center border border-white/5">
                    <div>
                      <div className="font-black text-sm uppercase tracking-tight">{v.name}</div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Factor: x{v.conversion_factor}</div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="font-black text-xl text-primary">${v.price.toFixed(2)}</div>
                      <button
                        onClick={() => handleDeleteVariant(v.id)}
                        className="p-2 text-danger hover:bg-danger/5 rounded-xl transition-all"
                        aria-label="Eliminar variante"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="neu-card !p-6 border border-primary/20 bg-primary/5 space-y-4 rounded-3xl">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Añadir Nueva Variante</h4>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  value={newVariantForm.name}
                  onChange={(e) => setNewVariantForm({ ...newVariantForm, name: e.target.value })}
                  className="neu-input w-full text-xs font-bold uppercase"
                  placeholder="Nombre (ej. Pack x12)"
                />
                <input
                  type="number"
                  value={newVariantForm.conversion_factor}
                  onChange={(e) => setNewVariantForm({ ...newVariantForm, conversion_factor: parseInt(e.target.value) || 1 })}
                  className="neu-input w-full text-xs font-bold"
                  placeholder="Factor"
                />
              </div>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                <input
                  type="number"
                  value={newVariantForm.price || ''}
                  onChange={(e) => setNewVariantForm({ ...newVariantForm, price: parseFloat(e.target.value) || 0 })}
                  className="neu-input w-full pl-12 text-xl font-black font-mono"
                  placeholder="0.00"
                />
              </div>
              <button
                onClick={() => {
                  if (!newVariantForm.name || !newVariantForm.price) { toast.error('Complete el nombre y el precio'); return; }
                  handleAddVariant(newVariantForm);
                  setNewVariantForm({ name: '', price: 0, conversion_factor: 1 });
                }}
                className="neu-btn-primary w-full !py-4 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20"
              >
                <Plus className="w-4 h-4" /> Registrar Variante
              </button>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setIsVariantsModalOpen(false)} className="neu-btn w-full !py-3 font-black text-xs uppercase tracking-widest">Cerrar Panel</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Store Modal */}
      <Dialog open={isEditStoreModalOpen} onOpenChange={setIsEditStoreModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5">
          <DialogHeader><DialogTitle className="font-black uppercase tracking-tight">Configurar Sucursal</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Nombre</label>
              <input type="text" value={editingStore?.name || ''} onChange={(e) => setEditingStore({ ...editingStore!, name: e.target.value })} className="neu-input w-full font-bold" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Dirección</label>
              <input type="text" value={editingStore?.address || ''} onChange={(e) => setEditingStore({ ...editingStore!, address: e.target.value })} className="neu-input w-full text-xs" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Logo de la Tienda</label>
              <div className="flex flex-col items-center gap-4">
                <div className="neu-raised-sm w-32 h-32 flex items-center justify-center overflow-hidden">
                  {editingStore?.logo_url ? (
                    <img
                      src={getStoreLogoUrl(editingStore.logo_url) || ''}
                      alt={editingStore.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building className="w-16 h-16 text-muted-foreground" />
                  )}
                </div>
                <input
                  type="file"
                  id="store-logo-upload"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpdateStoreLogo(file);
                  }}
                />
                <label
                  htmlFor="store-logo-upload"
                  className="neu-btn !px-4 !py-2 text-[8px] font-black uppercase tracking-widest cursor-pointer"
                >
                  Actualizar Logo
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setIsEditStoreModalOpen(false)}
              className="neu-btn flex-1 text-[10px] font-black uppercase"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpdateStore}
              className="neu-btn-primary flex-1 text-[10px] font-black uppercase shadow-lg shadow-primary/20"
            >
              Guardar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Store Modal */}
      <Dialog open={isCreateStoreModalOpen} onOpenChange={setIsCreateStoreModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader><DialogTitle className="font-black uppercase tracking-tight">Nueva Sucursal</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <input type="text" value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} className="neu-input w-full" placeholder="Nombre de la Tienda" />
            <input type="text" value={newStore.address} onChange={(e) => setNewStore({ ...newStore, address: e.target.value })} className="neu-input w-full text-xs" placeholder="Ubicación / Dirección" />
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Logo de Sucursal</label>
              <input type="file" onChange={(e) => setNewStoreLogo(e.target.files ? e.target.files[0] : null)} className="neu-input w-full text-[10px]" accept="image/*" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setIsCreateStoreModalOpen(false)}
              className="neu-btn flex-1 text-[10px] font-black uppercase"
            >
              Descartar
            </button>
            <button
              onClick={handleCreateStore}
              className="neu-btn-primary flex-1 text-[10px] font-black uppercase shadow-xl shadow-primary/20"
            >
              Registrar Tienda
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={isEditUserModalOpen} onOpenChange={setIsEditUserModalOpen}>
        <DialogContent className="max-w-xl !rounded-3xl border-white/5 shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader><DialogTitle className="font-black uppercase tracking-tight">Perfil de Usuario</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Nombre Completo</label>
              <input type="text" value={editingUser?.full_name || ''} onChange={(e) => setEditingUser({ ...editingUser!, full_name: e.target.value })} className="neu-input w-full font-black uppercase text-sm" placeholder="Nombre Completo" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Asignar Rol Operativo</label>
              <select value={editingUser?.role || ''} onChange={(e) => setEditingUser({ ...editingUser!, role: e.target.value as UserRole })} className="neu-input w-full text-xs font-bold uppercase">
                <option value="clerk">Cajero (POS)</option>
                <option value="manager">Gestor</option>
                <option value="warehouse">Almacén (Stock)</option>
                <option value="encargado">Encargado (Multi-tienda)</option>
                <option value="admin">Administrador (Full)</option>
              </select>
            </div>

            {user?.role === 'admin' && (editingUser?.role === 'encargado' || editingUser?.role === 'manager') && (
              <div className="grid grid-cols-2 gap-4 p-4 neu-inset-sm rounded-2xl">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-primary ml-1">Límite Tiendas</label>
                  <input
                    type="number"
                    value={editingUser.max_stores_limit || 0}
                    onChange={(e) => setEditingUser({ ...editingUser, max_stores_limit: parseInt(e.target.value) || 0 })}
                    className="neu-input w-full font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-primary ml-1">Límite Usuarios</label>
                  <input
                    type="number"
                    value={editingUser.max_users_limit || 0}
                    onChange={(e) => setEditingUser({ ...editingUser, max_users_limit: parseInt(e.target.value) || 0 })}
                    className="neu-input w-full font-bold"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Tiendas Asignadas y Roles</label>
              <div className="space-y-2 max-h-60 overflow-y-auto p-2 neu-inset-sm rounded-2xl no-scrollbar">
                {stores.map(store => {
                  const access = userStoreAccess.find(a => a.store_id === store.id);
                  return (
                    <div key={store.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-background/50 rounded-xl border border-white/5">
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={!!access}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUserStoreAccess([...userStoreAccess, { store_id: store.id, roles: ['clerk'] }]);
                            } else {
                              setUserStoreAccess(userStoreAccess.filter(a => a.store_id !== store.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-white/10 bg-background text-primary focus:ring-primary/20"
                        />
                        <span className="text-[10px] font-black uppercase truncate">{store.name}</span>
                      </label>

                      {access && (
                        <div className="flex flex-wrap gap-2">
                          {['clerk', 'warehouse', 'manager'].map((role) => (
                            <label key={role} className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={access.roles.includes(role as UserRole)}
                                onChange={(e) => {
                                  const newRoles = e.target.checked
                                    ? [...access.roles, role as UserRole]
                                    : access.roles.filter(r => r !== role);
                                  setUserStoreAccess(userStoreAccess.map(a =>
                                    a.store_id === store.id ? { ...a, roles: newRoles } : a
                                  ));
                                }}
                                className="w-3 h-3 rounded border-white/10 bg-background text-primary"
                              />
                              <span className="text-[8px] font-bold uppercase">{role === 'clerk' ? 'Cajero' : role === 'warehouse' ? 'Almacén' : 'Gestor'}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setIsEditUserModalOpen(false)}
              className="neu-btn flex-1 text-[10px] font-black uppercase"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpdateUser}
              className="neu-btn-primary flex-1 text-[10px] font-black uppercase shadow-xl shadow-primary/20"
            >
              Aplicar Cambios
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Modal */}
      <Dialog open={isCreateUserModalOpen} onOpenChange={setIsCreateUserModalOpen}>
        <DialogContent className="max-w-xl !rounded-3xl border-white/5 shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader><DialogTitle className="font-black uppercase tracking-tight">Alta de Usuario</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Nombre Completo</label>
              <input type="text" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} className="neu-input w-full font-bold" placeholder="Nombre y Apellido" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Email</label>
              <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="neu-input w-full text-xs" placeholder="Email Institucional" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Contraseña</label>
              <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="neu-input w-full" placeholder="Contraseña Temporal" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Rol</label>
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })} className="neu-input w-full text-xs font-black uppercase">
                <option value="clerk">Cajero</option>
                <option value="manager">Gestor</option>
                <option value="warehouse">Almacén</option>
                <option value="encargado">Encargado (Multi-tienda)</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Asignar Tiendas y Roles</label>
              <div className="space-y-2 max-h-60 overflow-y-auto p-2 neu-inset-sm rounded-2xl no-scrollbar">
                {stores.map(store => {
                  const access = userStoreAccess.find(a => a.store_id === store.id);
                  return (
                    <div key={store.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-background/50 rounded-xl border border-white/5">
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={!!access}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUserStoreAccess([...userStoreAccess, { store_id: store.id, roles: ['clerk'] }]);
                            } else {
                              setUserStoreAccess(userStoreAccess.filter(a => a.store_id !== store.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-white/10 bg-background text-primary focus:ring-primary/20"
                        />
                        <span className="text-[10px] font-black uppercase truncate">{store.name}</span>
                      </label>

                      {access && (
                        <div className="flex flex-wrap gap-2">
                          {['clerk', 'warehouse', 'manager'].map((role) => (
                            <label key={role} className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={access.roles.includes(role as UserRole)}
                                onChange={(e) => {
                                  const newRoles = e.target.checked
                                    ? [...access.roles, role as UserRole]
                                    : access.roles.filter(r => r !== role);
                                  setUserStoreAccess(userStoreAccess.map(a =>
                                    a.store_id === store.id ? { ...a, roles: newRoles } : a
                                  ));
                                }}
                                className="w-3 h-3 rounded border-white/10 bg-background text-primary"
                              />
                              <span className="text-[8px] font-bold uppercase">{role === 'clerk' ? 'Cajero' : role === 'warehouse' ? 'Almacén' : 'Gestor'}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setIsCreateUserModalOpen(false)}
              className="neu-btn flex-1 text-[10px] font-black uppercase"
            >
              Anular
            </button>
            <button
              onClick={handleCreateUser}
              className="neu-btn-primary flex-1 text-[10px] font-black uppercase shadow-xl shadow-primary/20"
            >
              Crear Acceso
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Store Confirmation */}
      <Dialog open={isDeleteStoreModalOpen} onOpenChange={setIsDeleteStoreModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-danger/20 shadow-2xl">
          <DialogHeader><DialogTitle className="text-danger font-black uppercase tracking-tight flex items-center gap-2"><Trash2 className="w-5 h-5" /> Confirmar Baja</DialogTitle></DialogHeader>
          <div className="py-6 text-center">
            <p className="text-sm font-bold uppercase tracking-tight">¿Eliminar permanentemente la sucursal <span className="text-danger font-black">{deletingStore?.name}</span>?</p>
            <p className="text-[10px] text-muted-foreground mt-4 uppercase tracking-[0.2em]">Esta operación no puede revertirse</p>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setIsDeleteStoreModalOpen(false)}
              className="neu-btn flex-1 text-[10px] font-black uppercase"
            >
              Descartar
            </button>
            <button
              onClick={handleDeleteStore}
              className="neu-btn-danger flex-1 text-[10px] font-black uppercase shadow-xl shadow-danger/20"
            >
              Confirmar Eliminación
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rest of the modals should follow similar styling for inputs and buttons... */}
    </div>
  );
}
