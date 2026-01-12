import { supabase } from '../supabaseClient.js'
import { SaleService } from '../../services/sale.service.js'
import { InventoryListener } from '../../services/inventory.listener.js'
import AdvancedTable from '../components/AdvancedTable.js'
import ViewHeader from '../../ui/components/ViewHeader.js'

/**
 * ========================================================================
 * CASHIER POS VIEW - Enterprise Point of Sale for Cashier/Clerk Role
 * ========================================================================
 * 
 * PURPOSE:
 * Specialized POS interface optimized for operational staff (cashiers/clerks).
 * Prioritizes speed, simplicity, and zero operational risk.
 * 
 * ROLE RESTRICTIONS (Enforced by UI - Backend has final authority):
 * ❌ NO inventory management
 * ❌ NO manual stock adjustments
 * ❌ NO price modifications
 * ❌ NO store selection
 * ❌ NO access to full sales history
 * ❌ NO exports or reports
 * 
 * ALLOWED OPERATIONS:
 * ✅ Search products (SKU/barcode/name)
 * ✅ Add products to cart
 * ✅ Process sales
 * ✅ View available stock (read-only)
 * 
 * ARCHITECTURE:
 * - 100% transactional integrity via process_sale_transaction RPC
 * - Immutable inventory with ledger-based stock_movements
 * - Real-time inventory updates via InventoryListener
 * - Variant conversion factors handled internally
 * - Optimized for ≤1000 products in-memory
 * 
 * UX DESIGN:
 * - Large touch-friendly buttons
 * - High contrast colors
 * - Minimal interface
 * - Keyboard + Mouse + Touch optimized
 * - Autofocus on search
 * - Enter key quick-add
 * 
 * @author Enterprise Architecture Team
 * @version 2.0.0
 * ========================================================================
 */
export default class CashierPOSView {
  constructor(container) {
    this.container = container

    // Core State
    this.cart = []
    this.products = []
    this.variants = []
    this.storeId = null
    this.userProfile = null

    // Financial State (Sale Metadata)
    this.paymentMethod = 'cash' // 'cash' | 'transfer'
    this.discountType = 'fixed'  // 'fixed' | 'percent'
    this.discountValue = 0
    this.cartOpen = false

    // Services
    this.saleService = null
    this.inventoryListener = null

    // UI State
    this.searchTerm = ''
    this.filteredProducts = []
    this.activeTab = 'pos' // 'pos' o 'history'

    // Advanced History State
    this.historyMode = 'list' // 'list' or 'summary'
    this.historyFilters = {
      search: '',
      status: '',
      dateFrom: '',
      dateTo: '',
      minAmount: '',
      maxAmount: ''
    }
    this.historySort = {
      column: 'created_at',
      direction: 'desc'
    }
    this.summaryPeriod = 'day' // 'day', 'month', 'year'
    this.historyPage = 0
    this.historyLimit = 30

    // Chart instances
    this.paymentChartInstance = null
    this.chartJsLoaded = false
  }

  /**
   * ====================================================================
   * INITIALIZATION & RENDERING
   * ====================================================================
   */
  async render() {
    // Expose to window immediately to avoid 'undefined' errors during async calls
    window.cashierPosView = this;

    // 1. Get authenticated user and profile
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    this.userProfile = profile
    this.storeId = profile?.store_id

    // 2. Initialize enterprise services
    if (this.storeId) {
      this.saleService = new SaleService(this.storeId, this.userProfile.id)
      this.inventoryListener = new InventoryListener(this.storeId)
    }

    // 3. Render main UI
    this.injectStyles()
    this.renderMainUI()

    // 4. Load data and setup (Always load products even if storeId is null for now)
    await this.loadProducts()
    this.setupSearch()
    this.setupRealtime()
    this.setupKeyboardShortcuts()

    // Debug State
    console.log('✅ CashierPOSView Initialized:', {
      profile: this.userProfile,
      storeId: this.storeId,
      productsCount: this.products.length,
      inventoryMode: 'Source of Truth: INVENTORY Table'
    });

    if (!this.storeId) {
      console.error('❌ CRITICAL: No Store ID found for user.');
      alert('Error Crítico: Su usuario no tiene una tienda asignada. Por favor contacte al administrador.');
    }

    // Auto-focus search input
    setTimeout(() => {
      document.getElementById('cashier-search')?.focus()
    }, 100)

    // Force title update
    window.loyApp.updateNavTitle('Cajero');
  }

  /**
   * Renders the main cashier interface
   */
  renderMainUI() {
    // 1. Set Title & Mobile Nav
    window.loyApp.updateNavTitle('Cajero');
    this.renderNavAction();

    this.container.innerHTML = `
      <div class="cashier-pos-container">
        ${!this.storeId ? '<div class="error-banner">⚠️ Error: No tienes tienda asignada</div>' : ''}
        
        <!-- SIDE MENU DRAWER (Unified) -->
        <div id="cashier-menu-overlay" class="drawer-overlay" onclick="window.cashierPosView.toggleMobileMenu()"></div>
        <div id="cashier-side-menu" class="pos-side-menu">
            <div class="menu-header">
                <h3>Menú Cajero</h3>
                <button onclick="window.cashierPosView.toggleMobileMenu()">&times;</button>
            </div>
            <div class="menu-items">
                <button class="menu-item ${this.activeTab === 'pos' ? 'active' : ''}" onclick="window.cashierPosView.navigateTo('pos')">
                    <i class="fas fa-shopping-cart"></i> Ventas
                </button>
                <button class="menu-item ${this.activeTab === 'history' && this.historyMode === 'list' ? 'active' : ''}" onclick="window.cashierPosView.navigateTo('history', 'list')">
                    <i class="fas fa-list"></i> Mis Ventas
                </button>
                <button class="menu-item ${this.activeTab === 'history' && this.historyMode === 'summary' ? 'active' : ''}" onclick="window.cashierPosView.navigateTo('history', 'summary')">
                    <i class="fas fa-chart-pie"></i> Resumen
                </button>
            </div>
            <div class="menu-footer">
                <span class="user-badge">${this.userProfile?.full_name || 'Usuario'}</span>
            </div>
        </div>

        <!-- PRODUCTS SECTION -->
        <div class="cashier-products-section">

          <div id="pos-dynamic-content" class="cashier-dynamic-content">
            <!-- DYNAMIC POS CONTENT -->
            ${this.activeTab === 'pos' ? `
              <!-- Ultra-fast search -->
              <div class="cashier-search-container">
                <div class="search-input-wrapper">
                  <i class="fas fa-search search-icon" aria-hidden="true"></i>
                  <input 
                    type="text" 
                    id="cashier-search" 
                    class="cashier-search-input"
                    placeholder="Buscar por SKU, código de barras o nombre..."
                    aria-label="Buscar"
                    autocomplete="off"
                  />
                </div>
              </div>

              <!-- Products grid -->
              <div id="cashier-products-grid" class="cashier-products-grid">
                <div class="loading-state">Cargando productos...</div>
              </div>
            ` : `
              <div id="history-container" class="history-container">
                <div class="loading-state">Cargando historial...</div>
              </div>
            `}
          </div>
        </div>

        <!-- CART SECTION -->
        <div class="cashier-cart-section ${this.cartOpen ? 'open' : ''}" id="pos-cart-panel" style="${this.activeTab === 'history' ? 'display: none;' : ''}">
          
          <!-- Mobile Toggle Bar -->
          <div class="cart-mobile-toggle" onclick="window.cashierPosView.toggleCart()">
            <div class="toggle-info">
                <div class="toggle-icon-badge">
                    <span>🛒</span>
                    <span class="badge-count" id="mobile-cart-count">0</span>
                </div>
                <div style="display:flex; flex-direction:column; line-height:1.2;">
                    <span class="toggle-label">Ver Carrito</span>
                    <small style="color:#64748b; font-size: 0.75rem;">${this.cart.length} productos</small>
                </div>
            </div>
            <div class="toggle-total">
                <span id="mobile-cart-total">$0.00</span>
                <i class="fas fa-chevron-up rotate-icon"></i>
            </div>
          </div>

          <div class="cart-main-content">
              <div class="cart-header desktop-only">
                <h2>🛒 Ticket de Venta</h2>
              </div>

              <!-- Cart items -->
              <div id="cashier-cart-items" class="cashier-cart-items">
                <div class="empty-cart-state">
                  <div class="empty-cart-icon">🛍️</div>
                  <p>Carrito vacío</p>
                  <small>Busca y agrega productos para comenzar</small>
                </div>
              </div>

              <!-- Cart summary -->
              <div class="cashier-cart-summary">
                <div class="summary-row">
                  <span class="summary-label">Subtotal:</span>
                  <span id="cashier-cart-subtotal" class="summary-value">$0.00</span>
                </div>
                <!-- ... discount and payments (kept same) ... -->
                <div class="discount-section">
                  <div class="summary-row">
                    <span class="summary-label">Descuento:</span>
                    <div class="discount-controls">
                      <select id="cashier-discount-type" onchange="window.cashierPosView.setDiscountType(this.value)" class="discount-select">
                        <option value="fixed" ${this.discountType === 'fixed' ? 'selected' : ''}>$</option>
                        <option value="percent" ${this.discountType === 'percent' ? 'selected' : ''}>%</option>
                      </select>
                      <input 
                        type="number" 
                        id="cashier-discount-value" 
                        class="discount-input" 
                        value="${this.discountValue}" 
                        oninput="window.cashierPosView.setDiscountValue(this.value)"
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                <div class="payment-section">
                  <div class="summary-row">
                    <span class="summary-label">Método de Pago:</span>
                    <select id="cashier-payment-method" onchange="window.cashierPosView.setPaymentMethod(this.value)" class="payment-select">
                      <option value="cash" ${this.paymentMethod === 'cash' ? 'selected' : ''}>💵 Efectivo</option>
                      <option value="transfer" ${this.paymentMethod === 'transfer' ? 'selected' : ''}>📱 Transferencia</option>
                    </select>
                  </div>
                </div>

                <div class="summary-row total-row">
                    <span class="summary-label">TOTAL NETO:</span>
                    <span id="cashier-cart-total" class="summary-value total-amount">$0.00</span>
                </div>
              </div>

              <!-- Checkout button -->
              <button 
                id="cashier-btn-checkout" 
                class="cashier-btn-checkout" 
                disabled
              >
                💰 COBRAR
              </button>

              <div class="cashier-quick-actions">
                <button id="cashier-btn-clear-cart" class="btn-secondary" disabled>
                  🗑️ Limpiar Carrito
                </button>
              </div>
          </div>
        </div>
      </div>
      
      <!-- Transaction Drawer -->
      <div id="pos-drawer-overlay" class="drawer-overlay" onclick="window.cashierPosView.closeDrawer()"></div>
      <div id="pos-transaction-drawer" class="pos-drawer"></div>
    `

    // Setup event handlers
    if (this.storeId && this.activeTab === 'pos') {
      const checkoutBtn = document.getElementById('cashier-btn-checkout');
      const clearBtn = document.getElementById('cashier-btn-clear-cart');
      if (checkoutBtn) checkoutBtn.onclick = () => this.handleCheckout();
      if (clearBtn) clearBtn.onclick = () => this.clearCart();
    }
  }

  renderNavAction() {
    const slot = document.getElementById('loy-nav-action-slot');
    if (slot) {
      slot.innerHTML = `
            <button class="loy-btn-icon" onclick="window.cashierPosView.toggleMobileMenu()" title="Menú">
                <i class="fas fa-bars"></i>
            </button>
        `;
    }
  }

  /**
   * Centralized Navigation Handler
   * @param {string} tab - 'pos' | 'history'
   * @param {string|null} mode - optional 'list' | 'summary' for history
   */
  navigateTo(tab, mode = null) {
    this.toggleMobileMenu(); // Always close menu

    // 1. Handle POS Tab
    if (tab === 'pos') {
      if (this.activeTab !== 'pos') {
        this.switchTab('pos');
      }
      return;
    }

    // 2. Handle History Tab
    if (tab === 'history') {
      const targetMode = mode || 'list';

      if (this.activeTab === 'history') {
        // Just switch mode if already in history
        this.setHistoryMode(targetMode);
      } else {
        // Helper to set mode before rendering
        this.historyMode = targetMode;
        this.switchTab('history');
      }
    }
  }

  toggleMobileMenu() {
    const menu = document.getElementById('cashier-side-menu');
    const overlay = document.getElementById('cashier-menu-overlay');
    if (menu && overlay) {
      menu.classList.toggle('open');
      overlay.classList.toggle('open');
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    // Note: historyMode is preserved or set by navigateTo before calling this

    this.renderMainUI();

    if (tab === 'pos') {
      // Restore search focus
      setTimeout(() => this.setupSearch(), 100);
      this.renderProducts();
      this.renderCart(); // Restore cart state
    } else {
      this.renderHistory();
    }
  }

  /**
   * ====================================================================
   * PRODUCT LOADING & MANAGEMENT
   * ====================================================================
   */
  async loadProducts() {
    try {
      // Fetch data from products table
      const { data: products } = await supabase
        .from('products')
        .select('*, stock_current')
      // .eq('store_id', this.storeId) // Temporarily disabled to match WarehouseView logic

      const { data: variants } = await supabase.from('product_variants').select('*')

      // Fetch inventory quantities from inventory table (source of truth)
      const { data: inventoryRecords } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .eq('store_id', this.storeId)

      // Create map for quick lookup
      const inventoryMap = new Map((inventoryRecords || []).map(i => [i.product_id, i.quantity]))

      this.variants = variants || []

      // Prepare Data
      this.products = (products || []).map(p => {
        const pVariants = this.variants.filter(v => v.product_id === p.id)
        const inventoryQty = inventoryMap.get(p.id) ?? 0

        return {
          ...p,
          stock: inventoryQty, // Fixed: Use inventory table as Source of Truth
          variants: pVariants,
          // Precompute search string for O(n) filtering performance
          searchString: `${p.name} ${p.sku || ''} ${p.barcode || ''}`.toLowerCase()
        }
      })

      this.filteredProducts = this.products
      this.renderProducts()

    } catch (error) {
      console.error('Error loading products:', error)
      this.showError('Error al cargar productos')
    }
  }

  /**
   * ====================================================================
   * SEARCH FUNCTIONALITY - ULTRA FAST MODE
   * ====================================================================
   */
  setupSearch() {
    const searchInput = document.getElementById('cashier-search')
    if (!searchInput) return

    // Real-time search
    searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase().trim()
      this.performSearch()
    })

    // Enter key quick-add
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.quickAddFirstResult()
      }
    })
  }

  /**
   * Performs fast in-memory search
   */
  performSearch() {
    if (!this.searchTerm) {
      this.filteredProducts = this.products
    } else {
      // O(n) search across all products
      this.filteredProducts = this.products.filter(p =>
        p.searchString.includes(this.searchTerm)
      )
    }

    this.renderProducts()
  }

  /**
   * Quick-add: adds first search result to cart (Enter key shortcut)
   */
  async quickAddFirstResult() {
    if (this.filteredProducts.length === 0) {
      this.showWarning('No se encontraron productos')
      return
    }

    const product = this.filteredProducts[0]

    // Clear search and refocus
    const searchInput = document.getElementById('cashier-search')
    if (searchInput) {
      searchInput.value = ''
      this.searchTerm = ''
      this.filteredProducts = this.products
    }

    await this.selectProduct(product.id)

    // Refocus search for next scan
    setTimeout(() => searchInput?.focus(), 100)
  }

  /**
   * ====================================================================
   * PRODUCT RENDERING - LARGE TOUCH-FRIENDLY CARDS
   * ====================================================================
   */
  renderProducts() {
    const container = document.getElementById('cashier-products-grid')
    if (!container) return

    if (this.filteredProducts.length === 0) {
      container.innerHTML = `
        <div class="no-results-state">
          <div class="no-results-icon">🔍</div>
          <p>No se encontraron productos</p>
          <small>Intenta con otro término de búsqueda</small>
        </div>
      `
      return
    }

    container.innerHTML = this.filteredProducts.map(p => {
      const isOutOfStock = p.stock <= 0
      const hasVariants = p.variants && p.variants.length > 0
      const minPrice = hasVariants ? Math.min(p.price, ...p.variants.map(v => v.price)) : p.price

      const thumbnailContent = p.image_url ?
        `<img src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'placeholder\\'>${p.name.charAt(0)}</div>'" />` :
        `<div class="placeholder">${p.name.charAt(0)}</div>`

      return `
        <div 
          class="pos-product-card ${isOutOfStock ? 'disabled' : ''} ${isOutOfStock ? 'state-out-of-stock' : (p.stock < 10 ? 'state-low-stock' : '')}" 
          onclick="${!isOutOfStock ? `window.cashierPosView.selectProduct('${p.id}')` : ''}"
          data-product-id="${p.id}"
          role="button"
          tabindex="0"
        >
            <div class="pos-card-thumbnail-wrapper">
                <div class="pos-card-thumbnail">
                    ${thumbnailContent}
                </div>
                ${isOutOfStock ? '<div class="stock-overlay">AGOTADO</div>' : ''}
            </div>
            
            <div class="pos-card-content">
                <div class="pos-card-header">
                    <span class="product-name" title="${p.name}">${p.name}</span>
                    <div class="product-meta">
                        ${p.sku ? `<span class="product-sku">${p.sku}</span>` : ''}
                    </div>
                </div>
                
                <div class="pos-card-price-block">
                    <div class="price-tag">
                        ${hasVariants ? '<span class="from-text">Desde</span>' : ''}
                        $${minPrice.toFixed(2)}
                    </div>
                    
                    <div class="stock-pill ${p.stock <= 10 ? (p.stock === 0 ? 'pill-empty' : 'pill-low') : 'pill-ok'}">
                         ${p.stock} un
                    </div>
                </div>
            </div>

            <!-- Mobile Action Button (Visual Cue) -->
            <div class="mobile-add-action">
                <i class="fas fa-plus-circle"></i>
            </div>
        </div>
      `
    }).join('')



    // Force layout recalculation after render (Hack for iOS/Safari/Mobile rendering issues)
    // Force layout recalculation after render (Hack for iOS/Safari/Mobile rendering issues)
    setTimeout(() => {
      const grid = document.getElementById('cashier-products-grid');
      if (grid) {
        grid.style.visibility = 'hidden';
        grid.offsetHeight; // Trigger reflow
        grid.style.visibility = 'visible';
      }
    }, 50);

    // Expose global reference
    window.cashierPosView = this
  }

  injectStyles() {
    if (document.getElementById('cashier-pos-styles')) return;

    const style = document.createElement('style');
    style.id = 'cashier-pos-styles';
    style.innerHTML = `
        /* Global Nav Overrides for POS */
        .loy-brand-title {
            font-size: 1.25rem;
            font-weight: 800;
            color: #1e293b;
            display: none; /* Shown via updateNavTitle logic */
        }

        .loy-brand-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        @media (max-width: 768px) {
            .loy-brand.has-custom-title {
                display: none !important;
            }
            .loy-brand-title {
                font-size: 1.1rem;
            }
            .loy-user-info {
                display: none !important;
            }
            .loy-nav {
                padding: 0.75rem 1rem !important;
            }
        }

        /* POS Container Layout */
        .cashier-pos-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: #f8fafc;
            overflow: hidden;
            position: relative;
        }

        .cashier-products-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden; /* Prevents overflow */
            padding: 16px;
            padding-bottom: 0; /* Let grid handle padding */
            min-width: 0; /* Critical for flex resizing */
        }
        
        .cashier-dynamic-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
            width: 100%;
            min-width: 0; /* Critical for grid inside flex */
        }

        .cashier-header {
            margin-bottom: 16px;
            flex-shrink: 0;
        }
        
        .cashier-title h1 {
            font-size: 1.5rem;
            color: #1e293b;
            margin: 0;
            font-weight: 800;
        }
        
        .role-badge {
            display: inline-block;
            background: #e0e7ff;
            color: #4338ca;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 0.7rem;
            font-weight: 700;
            margin-bottom: 4px;
        }

        /* Search Bar */
        /* Search Input Wrapper Pattern */
        .search-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            width: 100%;
        }

        .search-input-wrapper .search-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
            font-size: 0.9rem;
            pointer-events: none;
            z-index: 10;
        }

        .cashier-search-input {
            width: 100%;
            padding: 10px 12px 10px 36px !important;
            border: 1px solid #e2e8f0;
            border-radius: 20px;
            background: #f8fafc;
            font-size: 0.9rem;
            transition: all 0.2s;
            color: #1e293b;
            outline: none;
        }
        
        .cashier-search-input:focus {
            background: white;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        /* Product Grid Container */
        .cashier-products-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 4px;
            padding-bottom: 120px; /* More space for cart sheet */
        }

        /* CARD - MOBILE FIRST (Row Layout like AdvancedTable) */
        .pos-product-card {
            display: flex;
            flex-direction: row; /* Horizontal layout */
            align-items: center;
            background: white;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            padding: 8px;
            gap: 12px;
            width: 100%;
            height: auto;
            position: relative;
            user-select: none;
            transition: transform 0.1s;
        }

        .pos-product-card:active {
            transform: scale(0.98);
            background-color: #f8fafc;
        }

        .pos-product-card.disabled {
            opacity: 0.6;
            pointer-events: none;
            background-color: #f8fafc;
        }

        /* Thumbnail - Fixed Left Size */
        .pos-card-thumbnail-wrapper {
            width: 70px;
            height: 70px;
            flex-shrink: 0;
            position: relative;
            border-radius: 8px;
            overflow: hidden;
            background: #f1f5f9;
        }

        .pos-card-thumbnail {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .pos-card-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .pos-card-thumbnail .placeholder {
            font-size: 1.5rem;
            font-weight: 700;
            color: #cbd5e1;
        }

        /* Content - Flexible Right Side */
        .pos-card-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 0; /* Text truncation fix */
        }

        .pos-card-header {
            margin-bottom: 6px;
        }

        .product-name {
            font-size: 0.95rem;
            font-weight: 600;
            color: #1e293b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
            margin-bottom: 2px;
            height: auto; /* Reset fixed height from previous grid */
        }

        .product-meta {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .product-sku {
            font-size: 0.75rem;
            color: #64748b;
            font-family: monospace;
            background: #f1f5f9;
            padding: 2px 4px;
            border-radius: 4px;
        }

        .pos-card-price-block {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .price-tag {
            font-size: 1rem;
            font-weight: 700;
            color: #0f172a;
            display: flex;
            flex-direction: column;
            line-height: 1;
        }

        .price-tag .from-text {
            font-size: 0.6rem;
            color: #64748b;
            font-weight: 500;
            text-transform: uppercase;
        }

        /* Badges based on AdvancedTable pill style */
        .stock-pill {
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 700;
            display: inline-block;
        }
        .pill-ok { background: #f1f5f9; color: #475569; }
        .pill-low { background: #fff7ed; color: #c2410c; }
        .pill-empty { background: #fee2e2; color: #991b1b; }

        /* Mobile specific visual cues */
        .mobile-add-action {
            color: var(--loy-primary, #6366f1);
            font-size: 1.4rem;
            padding: 8px;
            display: flex;
            align-items: center;
        }
        
        .stock-overlay {
            position: absolute;
            inset: 0;
            background: rgba(255,255,255,0.7);
            color: #ef4444;
            display: flex; align-items: center; justify-content: center;
            font-size: 0.6rem;
            font-weight: 800;
            transform: rotate(-10deg);
            border: 2px solid #ef4444;
            margin: 4px;
            border-radius: 4px;
        }

        /* MEDIA QUERY: TABLET & DESKTOP (Grid Layout) */
        @media (min-width: 768px) {
            .cashier-products-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); 
                grid-auto-rows: min-content;
                gap: 16px;
                padding-bottom: 20px;
                align-content: start;
            }

            .pos-product-card {
                flex-direction: column; /* Stack vertically again */
                align-items: stretch;
                padding: 0;
                gap: 0;
                height: 100%;
                overflow: hidden;
            }

            .pos-card-thumbnail-wrapper {
                width: 100%;
                height: 140px; /* Fixed height for consistency */
                border-radius: 0;
            }
            
            .stock-overlay {
                font-size: 0.9rem;
                border: none;
                margin: 0;
                transform: none;
                background: rgba(255,255,255,0.85);
            }

            .pos-card-content {
                padding: 12px;
                gap: 12px;
            }

            .product-name {
                white-space: normal; /* Allow wrap */
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                height: 2.8em;
                margin-bottom: 0;
            }

            .pos-card-price-block {
                margin-top: auto;
            }
            
            .mobile-add-action {
                display: none; /* Hide explicit icon on desktop, entire card is clickable */
            }
            
            .pos-product-card:hover {
                transform: translateY(-4px);
                box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
            }
        }

        /* POS Side Menu Drawer */
        .pos-side-menu {
            position: fixed;
            top: 0; left: 0; bottom: 0;
            width: 280px;
            background: white;
            z-index: 1001;
            transform: translateX(-100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            box-shadow: 10px 0 30px rgba(0,0,0,0.1);
        }
        
        .pos-side-menu.open { transform: translateX(0); }
        
        .menu-header {
            padding: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #f1f5f9;
        }
        
        .menu-header h3 { margin: 0; font-size: 1.2rem; color: #1e293b; font-weight: 800; }
        .menu-header button { background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; }
        
        .menu-items { padding: 16px; flex: 1; }
        
        .menu-item {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            border: none;
            background: none;
            text-align: left;
            font-size: 1rem;
            color: #475569;
            border-radius: 12px;
            margin-bottom: 8px;
            transition: all 0.2s;
            font-weight: 600;
        }
        
        .menu-item:hover {
            background: #f8fafc;
            color: #1e293b;
        }
        
        .menu-item.active {
            background: #eff6ff;
            color: #2563eb;
            font-weight: 700;
        }

        
        .menu-footer {
            padding: 20px;
            border-top: 1px solid #f1f5f9;
            background: #f8fafc;
        }

        .user-badge {
            display: block;
            background: white;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            text-align: center;
            font-weight: 600;
            color: #1e293b;
            font-size: 0.9rem;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        /* Cart Section (Mobile Sheet) */
        .cashier-cart-section {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: white;
            border-top: 1px solid #e2e8f0;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
            z-index: 900;
            display: flex;
            flex-direction: column;
            height: 85vh; /* Max height when open */
            transform: translateY(calc(100% - 76px)); /* ONLY Show Header (approx 76px) */
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 20px 20px 0 0;
        }

        .cashier-cart-section.open {
            transform: translateY(0);
        }

        .cart-mobile-toggle {
            height: 76px;
            background: white;
            color: #1e293b;
            padding: 0 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            border-radius: 20px 20px 0 0;
            flex-shrink: 0;
            border-bottom: 1px solid #f1f5f9;
        }

        .toggle-info {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .toggle-icon-badge {
            position: relative;
            font-size: 1.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px; height: 40px;
            background: #f8fafc;
            border-radius: 12px;
            color: #334155;
        }

        .badge-count {
            position: absolute;
            top: -6px;
            right: -6px;
            background: #ef4444;
            color: white;
            font-size: 0.7rem;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 99px;
            min-width: 20px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border: 2px solid white;
        }

        .toggle-label {
            font-weight: 700;
            font-size: 1rem;
            color: #0f172a;
        }

        .toggle-total {
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 800;
            font-size: 1.1rem;
            color: #15803d; 
        }
        
        .rotate-icon {
            color: #94a3b8;
            transition: transform 0.3s;
        }

        .cart-main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: #ffffff;
        }

        /* POS CART ITEMS - ENTERPRISE DESIGN v1.0 */
        .cashier-cart-item {
            background: white;
            padding: 10px;
            border-radius: 12px;
            margin-bottom: 8px;
            display: flex;
            align-items: center; /* Vertical alignment */
            border: 1px solid #e2e8f0;
            transition: all 0.2s;
            gap: 12px;
        }

        .cart-item-thumbnail-wrapper {
            width: 48px;
            height: 48px;
            flex-shrink: 0;
            border-radius: 6px;
            overflow: hidden;
            background: #f1f5f9;
            border: 1px solid #f1f5f9;
        }

        .cart-item-thumbnail {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .cart-item-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .cart-item-thumbnail .placeholder {
            font-size: 1rem;
            font-weight: 800;
            color: #cbd5e1;
            text-transform: uppercase;
        }

        .cart-item-left {
            flex: 1;
            min-width: 0;
            padding-right: 12px;
        }

        .cart-item-name {
            font-weight: 700;
            color: #1e293b;
            font-size: 0.95rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .cart-meta-group { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }

        .cart-item-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            font-size: 0.75rem;
            color: #64748b;
        }

        .cart-item-variant {
            background: #eff6ff;
            padding: 2px 6px;
            border-radius: 4px;
            color: #2563eb;
            font-weight: 600;
        }

        .unit-price {
            font-weight: 600;
            color: #94a3b8;
        }

        .cart-item-right {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
            min-width: 140px;
        }

        .cart-item-total {
            font-weight: 800;
            font-size: 1.1rem;
            color: #4f46e5;
        }

        .cart-item-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .quantity-controls {
            display: flex;
            align-items: center;
            background: #f8fafc;
            border-radius: 8px;
            padding: 2px;
            border: 1px solid #f1f5f9;
        }

        .qty-btn {
            width: 28px;
            height: 28px;
            border: none;
            background: white;
            border-radius: 6px;
            color: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .qty-display {
            min-width: 32px;
            text-align: center;
            font-weight: 700;
            font-size: 0.9rem;
            color: #334155;
        }

        .btn-remove-item {
            color: #94a3b8;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 1rem;
            transition: color 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .btn-remove-item:hover { color: #ef4444; }

        /* Desktop Adjustments */
        .desktop-only { display: none; }

        @media (min-width: 1024px) {
            .cashier-cart-section {
                transform: none;
                height: 100%;
                border-radius: 0;
                z-index: 10;
                border-top: none;
            }
            
            .cart-mobile-toggle {
                display: none;
            }

            .desktop-only { display: block; }

            .cart-header {
                display: flex; /* Restore header on desktop */
                padding: 16px 20px;
                background: white;
                border-bottom: 1px solid #e2e8f0;
                align-items: center;
            }

            .cart-header h2 {
                font-size: 1.1rem;
                margin: 0;
                color: #1e293b;
            }

            .cashier-cart-items {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                background: #f8fafc;
                min-height: 0;
            }

            .cashier-cart-summary {
                padding: 20px;
                background: white;
                border-top: 1px solid #e2e8f0;
                box-shadow: 0 -4px 10px rgba(0,0,0,0.02);
            }

            .cashier-btn-checkout {
                width: 100%;
                background: #0f172a;
                color: white;
                padding: 16px;
                border-radius: 12px;
                font-size: 1.1rem;
                font-weight: 700;
                border: none;
                display: flex;
                justify-content: space-between;
                align-items: center;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                cursor: pointer;
                transition: background 0.2s;
            }
            
            .cashier-btn-checkout:hover:not(:disabled) {
                background: #1e293b;
            }
            
            .cashier-btn-checkout:disabled {
                background: #e2e8f0;
                color: #94a3b8;
                box-shadow: none;
                cursor: not-allowed;
            }
            
            .cashier-quick-actions {
                margin-top: 12px;
                display: flex;
                justify-content: center;
            }
            
            .btn-secondary {
                background: transparent;
                border: none;
                color: #64748b;
                font-size: 0.85rem;
                font-weight: 600;
                cursor: pointer;
                padding: 8px;
            }
            .btn-secondary:hover:not(:disabled) { color: #ef4444; }

            /* Responsive Layout Structure */
            @media (min-width: 1024px) {
                .cashier-pos-container {
                    flex-direction: row;
                }
                .cashier-products-section {
                    flex: 7; /* 70% width */
                    border-right: 1px solid #e2e8f0;
                    padding-bottom: 20px;
                    min-width: 0; /* Prevents flex blowout */
                }
                .cashier-cart-section {
                    position: static;
                    flex: 3; /* 30% width */
                    height: 100%;
                    border-top: none;
                    box-shadow: none;
                    min-width: 320px; /* Min width for cart */
                }
                
                /* ROBUST GRID LAYOUT FIX */
                .cashier-products-grid {
                    display: grid;
                    /* Increased minmax to 180px prevents collapse and improves readability */
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 16px;
                    width: 100%;
                    padding: 4px; /* Space for focus rings/shadows */
                    padding-bottom: 80px; 
                    align-content: start; /* Prevents row stretching */
                }
            }
        }

        /* Summary Section - Chart Styles */
        .chart-container {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-top: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            border: 1px solid #e2e8f0;
        }

        .chart-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #1e293b;
            margin: 0 0 20px 0;
            text-align: center;
        }

        .chart-wrapper {
            position: relative;
            max-width: 400px;
            margin: 0 auto;
            padding: 20px;
        }

        @media (max-width: 768px) {
            .chart-container {
                padding: 16px;
                margin-top: 16px;
            }
            
            .chart-wrapper {
                max-width: 300px;
                padding: 10px;
            }
        }

    `;
    document.head.appendChild(style);
  }

  /**
   * Stock badge visual helpers
   */
  getStockBadgeClass(stock) {
    if (stock <= 0) return 'stock-empty'
    if (stock <= 10) return 'stock-low'
    return 'stock-ok'
  }

  getStockBadgeText(stock) {
    if (stock <= 0) return '⛔ Sin stock'
    if (stock <= 10) return `⚠️ ${stock} unidades`
    return `✓ ${stock} unidades`
  }

  /**
   * ====================================================================
   * PRODUCT SELECTION & VARIANT HANDLING
   * ====================================================================
   */
  async selectProduct(productId) {
    const product = this.products.find(p => p.id === productId)
    if (!product) return

    // Validation: Check stock
    if (product.stock <= 0) {
      this.showWarning('Producto sin stock disponible')
      return
    }

    // If no variants, add base product directly
    if (!product.variants || product.variants.length === 0) {
      this.addToCart(product, null)
      return
    }

    // Show simplified variant selection modal
    await this.showVariantSelectionModal(product)
  }

  /**
   * Simplified variant selection modal (radio list)
   */
  async showVariantSelectionModal(product) {
    // Build options: Base unit + variants
    const options = [
      {
        name: `Unidad (${product.name})`,
        price: product.price,
        id: 'base',
        factor: 1
      },
      ...product.variants.map(v => ({
        name: v.name,
        price: v.price,
        id: v.id,
        factor: v.conversion_factor
      }))
    ]

    const { value: selectedVariantId } = await Swal.fire({
      title: 'Seleccionar Presentación',
      html: `
        <div class="variant-selection-modal">
          ${options.map(opt => `
            <div class="variant-option">
              <input 
                type="radio" 
                name="variant" 
                id="variant-${opt.id}" 
                value="${opt.id}"
                ${opt.id === 'base' ? 'checked' : ''}
              />
              <label for="variant-${opt.id}">
                <span class="variant-name">${opt.name}</span>
                <span class="variant-price">$${opt.price.toFixed(2)}</span>
              </label>
            </div>
          `).join('')}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const selected = document.querySelector('input[name="variant"]:checked')
        return selected ? selected.value : null
      }
    })

    if (selectedVariantId) {
      const selectedOption = options.find(o => o.id === selectedVariantId)
      this.addToCart(product, selectedOption)
    }
  }

  /**
   * ====================================================================
   * CART MANAGEMENT - HIGH USABILITY
   * ====================================================================
   */
  async addToCart(product, variantOption) {
    // 1. Server-Side Stock Validation (Critical for concurrency)
    try {
      const { data: freshInventory } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('product_id', product.id)
        .eq('store_id', this.storeId)
        .single();

      if (freshInventory) {
        // Sync local state immediately from inventory table (source of truth)
        product.stock = freshInventory.quantity ?? 0;
        // Reflash UI if needed (lightweight)
        const card = document.querySelector(`[data-product-id="${product.id}"] .stock-pill`);
        if (card) card.textContent = `${product.stock} un`;
      }
    } catch (e) { console.error("Stock check failed", e); }

    // Resolve variant details
    const isBase = !variantOption || variantOption.id === 'base'
    const price = isBase ? product.price : variantOption.price
    const variantId = isBase ? null : variantOption.id
    const factor = isBase ? 1 : variantOption.factor
    const variantName = isBase ? null : variantOption.name

    // Local stock validation (UX optimization)
    // Aggressive check: prevents adding if total usage > stock
    const currentCartUsage = this.cart.reduce((sum, item) => {
      if (item.product.id === product.id) {
        return sum + (item.quantity * item.factor)
      }
      return sum
    }, 0)

    if (currentCartUsage + factor > product.stock) {
      this.showWarning(`Stock insuficiente. Disponible: ${product.stock} unidades base`)
      return
    }

    // Check if item already exists in cart
    const existing = this.cart.find(
      item => item.product.id === product.id && item.variantId === variantId
    )

    if (existing) {
      // Increment quantity
      existing.quantity++
    } else {
      // Add new item
      this.cart.push({
        product,
        variantId,
        variantName,
        price,
        quantity: 1,
        factor
      })
    }

    this.renderCart()
    this.showSuccess(`✓ ${product.name} agregado`)
  }

  /**
   * Increment item quantity
   */
  incrementCartItem(index) {
    const item = this.cart[index]
    if (!item) return

    // Check stock availability
    const currentCartUsage = this.cart.reduce((sum, cartItem) => {
      if (cartItem.product.id === item.product.id) {
        return sum + (cartItem.quantity * cartItem.factor)
      }
      return sum
    }, 0)

    if (currentCartUsage + item.factor > item.product.stock) {
      this.showWarning('Stock insuficiente para incrementar cantidad')
      return
    }

    item.quantity++
    this.renderCart()
  }

  /**
   * Decrement item quantity
   */
  decrementCartItem(index) {
    const item = this.cart[index]
    if (!item) return

    if (item.quantity > 1) {
      item.quantity--
      this.renderCart()
    } else {
      this.removeFromCart(index)
    }
  }

  /**
   * Remove item from cart
   */
  removeFromCart(index) {
    this.cart.splice(index, 1)
    this.renderCart()
  }

  /**
   * Clear entire cart
   */
  clearCart() {
    Swal.fire({
      title: '¿Limpiar carrito?',
      text: 'Se eliminarán todos los productos',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.cart = []
        this.renderCart()
        this.showSuccess('Carrito limpiado')
      }
    })
  }

  /**
   * Renders cart items and summary
   */
  renderCart() {
    const container = document.getElementById('cashier-cart-items')
    const btnCheckout = document.getElementById('cashier-btn-checkout')
    const btnClear = document.getElementById('cashier-btn-clear-cart')

    if (this.cart.length === 0) {
      container.innerHTML = `
        <div class="empty-cart-state">
          <div class="empty-cart-icon">🛍️</div>
          <p>Carrito vacío</p>
          <small>Busca y agrega productos para comenzar</small>
        </div>
      `
      btnCheckout.disabled = true
      btnClear.disabled = true
      this.updateCartSummary()
      return
    }

    container.innerHTML = this.cart.map((item, index) => {
      const p = item.product;
      const thumbnailContent = p.image_url ?
        `<img src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'placeholder\\'>${p.name.charAt(0)}</div>'" />` :
        `<div class="placeholder">${p.name.charAt(0)}</div>`

      return `
        <div class="cashier-cart-item">
          <div class="cart-item-thumbnail-wrapper">
            <div class="cart-item-thumbnail">
              ${thumbnailContent}
            </div>
          </div>

          <div class="cart-item-left">
            <div class="cart-item-name">${p.name}</div>
            <div class="cart-item-meta">
              ${item.variantName ? `<span class="cart-item-variant">${item.variantName}</span>` : ''}
              ${p.sku ? `<span class="cart-item-sku">#${p.sku}</span>` : ''}
              <span class="unit-price">@ $${item.price.toFixed(2)}</span>
            </div>
          </div>

          <div class="cart-item-right">
            <div class="cart-item-total">$${(item.price * item.quantity).toFixed(2)}</div>
            
            <div class="cart-item-actions">
              <div class="quantity-controls">
                <button 
                  class="qty-btn qty-btn-minus" 
                  onclick="window.cashierPosView.decrementCartItem(${index})"
                >−</button>
                <span class="qty-display">${item.quantity}</span>
                <button 
                  class="qty-btn qty-btn-plus" 
                  onclick="window.cashierPosView.incrementCartItem(${index})"
                >+</button>
              </div>

              <button 
                class="btn-remove-item" 
                onclick="window.cashierPosView.removeFromCart(${index})"
                title="Eliminar"
              >
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('')

    btnCheckout.disabled = false
    btnClear.disabled = false
    this.updateCartSummary()
  }

  /**
   * Updates cart summary totals and mobile counter
   */
  updateCartSummary() {
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    let discount = 0
    if (this.discountType === 'fixed') {
      discount = this.discountValue
    } else {
      discount = subtotal * (this.discountValue / 100)
    }

    const total = Math.max(0, subtotal - discount)

    // Update Desktop UI
    const subtotalEl = document.getElementById('cashier-cart-subtotal')
    const totalEl = document.getElementById('cashier-cart-total')
    const checkoutBtn = document.getElementById('cashier-btn-checkout')
    const clearBtn = document.getElementById('cashier-btn-clear-cart')

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`

    // Update Mobile UI Counter & Total
    const mobileCountEl = document.getElementById('mobile-cart-count')
    const mobileTotalEl = document.getElementById('mobile-cart-total')
    const mobileLabelEl = document.querySelector('.toggle-info small')

    if (mobileCountEl) mobileCountEl.textContent = this.cart.length
    if (mobileTotalEl) mobileTotalEl.textContent = `$${total.toFixed(2)}`
    if (mobileLabelEl) mobileLabelEl.textContent = `${this.cart.length} productos`

    if (checkoutBtn) {
      checkoutBtn.disabled = this.cart.length === 0
      checkoutBtn.innerHTML = this.cart.length === 0 ? '💰 COBRAR' : `💰 COBRAR $${total.toFixed(2)}`
    }
    if (clearBtn) clearBtn.disabled = this.cart.length === 0
  }

  // Financial Handlers
  setDiscountType(type) {
    this.discountType = type
    this.updateCartSummary()
  }

  setDiscountValue(val) {
    this.discountValue = val
    this.updateCartSummary()
  }

  setPaymentMethod(method) {
    this.paymentMethod = method
  }

  toggleCart() {
    this.cartOpen = !this.cartOpen
    const cartPanel = document.getElementById('pos-cart-panel')
    const toggleIcon = cartPanel.querySelector('.rotate-icon')

    if (this.cartOpen) {
      cartPanel.classList.add('open')
      if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)'
    } else {
      cartPanel.classList.remove('open')
      if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)'
    }
  }

  /**
   * ====================================================================
   * CHECKOUT - ENTERPRISE TRANSACTION HANDLING
   * ====================================================================
   */
  async handleCheckout() {
    if (this.cart.length === 0) return

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    let discount = 0
    if (this.discountType === 'percent') {
      discount = subtotal * (parseFloat(this.discountValue || 0) / 100)
    } else {
      discount = parseFloat(this.discountValue || 0)
    }
    const totalAmount = Math.max(0, subtotal - discount)

    // Pre-checkout confirmation
    const { isConfirmed } = await Swal.fire({
      title: '💰 Confirmar Venta',
      html: `
        <div class="checkout-confirmation">
          <div class="checkout-summary">
            <div class="summary-line">
              <span>Subtotal:</span>
              <strong>$${subtotal.toFixed(2)}</strong>
            </div>
            ${discount > 0 ? `
            <div class="summary-line" style="color: #ef4444;">
              <span>Descuento:</span>
              <strong>-$${discount.toFixed(2)}</strong>
            </div>` : ''}
            <div class="summary-line">
              <span>Método:</span>
              <strong>${this.paymentMethod === 'cash' ? '💵 Efectivo' : '📱 Transferencia'}</strong>
            </div>
            <div class="summary-line total-line">
              <span>Total Neto:</span>
              <strong>$${totalAmount.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '✓ COBRAR',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#28a745'
    })

    if (!isConfirmed) return

    // Prepare sale metadata
    const saleData = {
      paymentMethod: this.paymentMethod,
      discountType: this.discountType,
      discountValue: parseFloat(this.discountValue || 0),
      subtotal: subtotal,
      totalAmount: totalAmount
    }

    // Execute transactional sale
    await this.processSaleTransaction(saleData)
  }

  /**
   * Executes the sale through SaleService RPC
   */
  async processSaleTransaction(saleData) {
    const btn = document.getElementById('cashier-btn-checkout')
    if (!btn) return;

    // Loading state
    btn.disabled = true
    const originalText = btn.textContent
    btn.textContent = '⏳ Procesando...'
    btn.classList.add('processing')

    try {
      // Delegate to SaleService - handles all transactional logic
      const result = await this.saleService.processSale(this.cart, saleData)

      // Success!
      this.updateLocalStockAfterSale()

      await Swal.fire({
        title: '✓ Venta Exitosa',
        html: `
            <p>La transacción se completó correctamente.</p>
            <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 0.9em; margin-top: 15px; border: 1px solid #e2e8f0; color: #1e293b;">
                <div style="font-weight: bold; margin-bottom: 4px; color: #64748b; font-size: 0.8em; text-transform: uppercase;">ID Transacción</div>
                ${result.transaction_id || 'ID NO DEVUELTO'}
            </div>
        `,
        icon: 'success',
        timer: 2000,
        showConfirmButton: true,
        confirmButtonText: 'Continuar'
      })

      // Reset financial state
      this.discountValue = 0
      this.paymentMethod = 'cash'
      this.cart = []
      this.renderCart()

      // Reset search and filters
      this.searchTerm = ''
      this.filteredProducts = this.products

      this.switchTab('pos') // Full re-render to reset UI and restore products grid

      // Refocus search for next customer
      setTimeout(() => {
        document.getElementById('cashier-search')?.focus()
      }, 100)

    } catch (error) {
      console.error('Sale transaction failed:', error)

      // Handle known errors
      if (error.message.includes('Stock insuficiente')) {
        await Swal.fire({
          title: '⚠️ Stock Insuficiente',
          text: 'Uno o más productos no tienen stock disponible. Otro usuario pudo haber comprado el último artículo.',
          icon: 'warning',
          confirmButtonText: 'Entendido'
        })
        await this.loadProducts()
      } else {
        await Swal.fire({
          title: '❌ Error de Transacción',
          text: error.message || 'No se pudo completar la venta. Por favor intenta nuevamente.',
          icon: 'error',
          confirmButtonText: 'Entendido'
        })
      }
    } finally {
      // Restore button state
      btn.disabled = false
      btn.textContent = originalText
      btn.classList.remove('processing')
    }
  }

  /**
   * ====================================================================
   * REAL-TIME INVENTORY UPDATES
   * ====================================================================
   */
  setupRealtime() {
    // 1. Subscribe to INVENTORY table changes (Stock quantity from atomic trigger)
    if (this.inventoryChannel) supabase.removeChannel(this.inventoryChannel);

    this.inventoryChannel = supabase
      .channel('pos-inventory-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory',
          filter: `store_id=eq.${this.storeId}`
        },
        (payload) => {
          const { new: updated, eventType } = payload;
          if (!updated) return;

          // Find and update local product stock from inventory table (source of truth)
          const p = this.products.find(prod => prod.id === updated.product_id);
          if (p) {
            p.stock = updated.quantity ?? 0;

            // Re-render UI: Flash Card
            this.flashProductCard(p.id);

            // Re-render text elements inside card without full re-render
            const card = document.querySelector(`[data-product-id="${p.id}"]`);
            if (card) {
              // Update Badge/Pill
              const pill = card.querySelector('.stock-pill');
              if (pill) {
                pill.className = `stock-pill ${p.stock <= 10 ? (p.stock <= 0 ? 'pill-empty' : 'pill-low') : 'pill-ok'}`;
                pill.textContent = `${p.stock} un`;
              }
              // Update State Class
              if (p.stock <= 0) {
                card.classList.add('state-out-of-stock');
                card.classList.add('disabled');
                // Add stock overlay if missing
                let thumb = card.querySelector('.pos-card-thumbnail-wrapper');
                if (thumb && !thumb.querySelector('.stock-overlay')) {
                  thumb.innerHTML += '<div class="stock-overlay">AGOTADO</div>';
                }
              } else {
                card.classList.remove('state-out-of-stock');
                card.classList.remove('disabled');
                // Remove stock overlay
                let overlay = card.querySelector('.stock-overlay');
                if (overlay) overlay.remove();
              }
            }
          }
        }
      )
      .subscribe();

    // 2. Subscribe to PRODUCTS table changes (Price updates only - keep inventory from inventory table)
    if (this.productsChannel) supabase.removeChannel(this.productsChannel);

    this.productsChannel = supabase
      .channel('pos-products-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        (payload) => {
          const updated = payload.new;
          if (!updated) return;

          // Find and update local product - ONLY sync price, not stock
          const p = this.products.find(prod => prod.id === updated.id);
          if (p) {
            p.price = updated.price; // Sync price only

            // Re-render UI: Flash Card
            this.flashProductCard(p.id);

            // Update Price
            const card = document.querySelector(`[data-product-id="${p.id}"]`);
            if (card) {
              const priceTag = card.querySelector('.price-tag');
              if (priceTag) {
                const minPrice = p.variants && p.variants.length > 0 ? Math.min(p.price, ...p.variants.map(v => v.price)) : p.price;
                priceTag.innerHTML = `
                        ${p.variants && p.variants.length > 0 ? '<span class="from-text">Desde</span>' : ''}
                        $${minPrice.toFixed(2)}
                     `;
              }
            }
          }
        }
      )
      .subscribe();

    // 3. Subscribe to personal transaction changes (to update "Mis Ventas" in real-time)
    // ✅ MEJORADO: Guardar en variable para cleanup posterior
    if (this.personalTransactionsChannel) supabase.removeChannel(this.personalTransactionsChannel);

    this.personalTransactionsChannel = supabase
      .channel('personal-transactions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `seller_id=eq.${this.userProfile.id}`
        },
        (payload) => {
          console.log('Nueva venta personal detectada (Realtime):', payload)
          // If we are in history tab, refresh the data
          if (this.activeTab === 'history') {
            if (this.historyMode === 'list' && this.historyTable) {
              this.historyTable.refresh()
            } else if (this.historyMode === 'summary') {
              this.renderHistorySummary()
            }
          }
        }
      )
      .subscribe()
  }

  /**
   * Flash visual effect when stock changes
   */
  flashProductCard(productId) {
    const card = document.querySelector(`[data-product-id="${productId}"]`)
    if (card) {
      card.classList.add('stock-updated-flash')
      setTimeout(() => card.classList.remove('stock-updated-flash'), 1000)
    }
  }

  /**
   * ====================================================================
   * KEYBOARD SHORTCUTS
   * ====================================================================
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // F2: Focus search
      if (e.key === 'F2') {
        e.preventDefault()
        document.getElementById('cashier-search')?.focus()
      }

      // F9: Checkout (if cart has items)
      if (e.key === 'F9') {
        e.preventDefault()
        if (this.cart.length > 0) {
          this.handleCheckout()
        }
      }

      // ESC: Clear search and refocus
      if (e.key === 'Escape') {
        const searchInput = document.getElementById('cashier-search')
        if (searchInput && document.activeElement === searchInput) {
          searchInput.value = ''
          this.searchTerm = ''
          this.filteredProducts = this.products
          this.renderProducts()
        }
      }
    })
  }

  /**
   * ====================================================================
   * UI HELPERS & NOTIFICATIONS
   * ====================================================================
   */
  showSuccess(message) {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true
    })

    Toast.fire({
      icon: 'success',
      title: message
    })
  }

  showWarning(message) {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    })

    Toast.fire({
      icon: 'warning',
      title: message
    })
  }

  showError(message) {
    Swal.fire({
      title: 'Error',
      text: message,
      icon: 'error',
      confirmButtonText: 'Entendido'
    })
  }

  /**
   * ====================================================================
   * LIFECYCLE & CLEANUP
   * ====================================================================
   */
  destroy() {
    // Destroy chart instances
    if (this.paymentChartInstance) {
      this.paymentChartInstance.destroy()
      this.paymentChartInstance = null
    }

    // Unsubscribe from realtime
    if (this.inventoryListener) {
      this.inventoryListener.unsubscribe()
    }

    // ✅ NUEVO: Limpiar canales Realtime
    if (this.inventoryChannel) {
      supabase.removeChannel(this.inventoryChannel);
      this.inventoryChannel = null;
      console.log('[CashierPOSView] Cleaned up inventoryChannel');
    }

    if (this.productsChannel) {
      supabase.removeChannel(this.productsChannel);
      this.productsChannel = null;
      console.log('[CashierPOSView] Cleaned up productsChannel');
    }

    // ✅ NUEVO: Limpiar canal personal-transactions
    if (this.personalTransactionsChannel) {
      supabase.removeChannel(this.personalTransactionsChannel);
      this.personalTransactionsChannel = null;
      console.log('[CashierPOSView] Cleaned up personalTransactionsChannel');
    }

    // ✅ NUEVO: Limpiar historyTable si existe
    if (this.historyTable && typeof this.historyTable.destroy === 'function') {
      this.historyTable.destroy();
      this.historyTable = null;
      console.log('[CashierPOSView] Destroyed historyTable');
    }

    // Clean up global reference
    if (window.cashierPosView === this) {
      delete window.cashierPosView
    }

    // Remove keyboard listeners
    // (In production, track listeners to remove specifically)

    console.log('[CashierPOSView] Destroy completed');
  }

  /**
   * ====================================================================
   * NAVIGATION & DYNAMIC TAB RENDERING
   * ====================================================================
   */
  async renderTab(tabName) {
    if (this.activeTab === tabName) return
    this.activeTab = tabName

    // Re-render UI to update tabs and content structure
    this.renderMainUI()

    if (this.activeTab === 'pos') {
      await this.loadProducts()
      this.setupSearch()
      this.renderCart()
      setTimeout(() => document.getElementById('cashier-search')?.focus(), 100)
    } else if (this.activeTab === 'history') {
      await this.renderHistory()
    }
  }

  /**
   * ====================================================================
   * PERSONAL HISTORY LOGIC
   * ====================================================================
   */
  /**
   * ====================================================================
   * PERSONAL HISTORY LOGIC - ENTERPRISE GRADE
   * ====================================================================
   */
  async renderHistory() {
    const container = document.getElementById('history-container')
    if (!container) return

    // Clear container but reserve structure if needed (AdvancedTable will fill it)
    container.innerHTML = `<div id="history-content-area" class="history-content-area" style="height: 100%; display: flex; flex-direction: column;"></div>`;

    // Update global header title
    window.loyApp.updateNavTitle('Mis Ventas');
    this.renderNavAction(); // Ensure hamburger menu is available

    if (this.historyMode === 'list') {
      await this.renderHistoryList()
    } else {
      await this.renderHistorySummary()
    }
  }


  renderPeriodSelector() {
    return `
            <div class="period-selector">
                <button class="period-btn ${this.summaryPeriod === 'day' ? 'active' : ''}" onclick="window.cashierPosView.setSummaryPeriod('day')">Hoy</button>
                <button class="period-btn ${this.summaryPeriod === 'month' ? 'active' : ''}" onclick="window.cashierPosView.setSummaryPeriod('month')">Este Mes</button>
                <button class="period-btn ${this.summaryPeriod === 'year' ? 'active' : ''}" onclick="window.cashierPosView.setSummaryPeriod('year')">Este Año</button>
            </div>
        `
  }

  async setHistoryMode(mode) {
    this.historyMode = mode
    await this.renderHistory()
  }

  async setSummaryPeriod(period) {
    this.summaryPeriod = period
    await this.renderHistory()
  }


  async renderHistoryList() {
    const contentArea = document.getElementById('history-content-area')
    if (!contentArea) return

    this.historyTable = new AdvancedTable({
      container: contentArea,
      id: 'personalSalesTable',
      title: '',
      columns: [
        { key: 'created_at', label: 'Fecha/Hora', sortable: true, format: 'datetime' },
        {
          key: 'payment_method',
          label: 'Método',
          format: 'formatter',
          formatter: (val) => `<span class="method-pill ${val}">${val === 'transfer' ? '📱 Transf.' : '💵 Efectivo'}</span>`
        },
        {
          key: 'discount_value',
          label: 'Desc.',
          format: 'currency',
          align: 'right'
        },
        { key: 'total_amount', label: 'Total Neto', sortable: true, format: 'currency', align: 'right' },
        {
          key: 'status',
          label: 'Estado',
          format: 'badge',
          badgeMap: { 'completed': 'badge-success', 'voided': 'badge-error' },
          labelMap: { 'completed': 'Completada', 'voided': 'Anulada' }
        }
      ],
      filters: [
        { key: 'search', label: 'Búsqueda', type: 'text', placeholder: 'ID...' },
        {
          key: 'payment_method',
          label: 'Método Pago',
          type: 'select',
          options: [
            { value: '', label: 'Todos' },
            { value: 'cash', label: 'Efectivo' },
            { value: 'transfer', label: 'Transferencia' }
          ]
        },
        {
          key: 'status',
          label: 'Estado',
          type: 'select',
          options: [
            { value: 'completed', label: 'Completada' },
            { value: 'voided', label: 'Anulada' }
          ]
        },
        { key: 'dateFrom', label: 'Desde', type: 'date' },
        { key: 'dateTo', label: 'Hasta', type: 'date' }
      ],
      summaryFields: [
        { key: 'total_count', label: 'Ventas' },
        { key: 'total_amount_sum', label: 'Recaudación Neto', format: 'currency', highlight: true, prefix: '$', decimals: 2 }
      ],
      fetchData: async (filters, sort) => {
        // Enforce timeout to prevent infinite loading
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tiempo de espera agotado. Verifica tu conexión.')), 10000)
        );

        const fetchPromise = (async () => {
          if (!supabase) throw new Error('Cliente Supabase no inicializado');

          let dateTo = null;
          if (filters.dateTo) {
            const d = new Date(filters.dateTo);
            d.setHours(23, 59, 59, 999);
            dateTo = d.toISOString();
          }

          // Ensure user is authenticated before call
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Sesión expirada. Por favor, recarga y loguéate nuevamente.');

          const { data, error } = await supabase.rpc('get_my_sales', {
            p_search_query: filters.search || null,
            p_status: filters.status || null,
            p_payment_method: filters.payment_method || null,
            p_date_from: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
            p_date_to: dateTo,
            p_sort_column: sort.column || 'created_at',
            p_sort_direction: sort.direction || 'desc',
            p_limit: 100,
            p_offset: 0
          });


          if (error) {
            console.error('get_my_sales RPC Error:', error);
            // Handle "function not found" gracefully
            if (error.code === '42883') throw new Error('La función de historial no está configurada en la base de datos.');
            throw new Error(error.message || 'Error al obtener ventas');
          }

          const rows = data || [];
          console.log("Mis Ventas (Cajero) - Datos recuperados:", rows);

          let summaryData = {};

          if (rows.length > 0) {
            summaryData = {
              total_count: rows[0].total_count || 0,
              total_amount_sum: rows[0].total_amount_sum || 0
            };
          }

          return {
            data: rows,
            summary: summaryData
          };
        })();

        return Promise.race([fetchPromise, timeout]);
      },
      onRowClick: (row) => this.showTransactionDrawer(row.id),
      toolbarActions: [], // Unified in Hamburger Menu
      mobileCardRenderer: (row, idx) => {
        const date = new Date(row.created_at).toLocaleDateString();
        const time = new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const total = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.total_amount || 0);
        const statusClass = row.status === 'completed' ? 'green' : 'red';
        const statusLabel = row.status === 'completed' ? 'Completada' : 'Anulada';

        return `
            <div class="adv-mobile-card" onclick="window['${this.historyTable.id}'].handleRowClick(${idx})">
                <div class="card-thumbnail-wrapper" style="width: auto; padding: 0 8px;">
                     <div class="status-dot ${statusClass}"></div>
                     <div style="font-size: 1.5rem;">🧾</div>
                </div>
                <div class="card-info">
                    <div class="card-name">Venta #${row.id.substring(0, 8)}</div>
                    <div class="card-meta">${date} • ${time} • ${row.payment_method === 'transfer' ? '📱 Transf.' : '💵 Efectivo'}</div>
                    <div class="card-price">${total}</div>
                </div>
                <div class="card-stock-wrapper">
                    <span style="font-size: 0.75rem; font-weight: 700; color: ${statusClass === 'green' ? '#10b981' : '#ef4444'}">${statusLabel}</span>
                </div>
            </div>
          `;
      }
    });

    try {
      await this.historyTable.render();
    } catch (err) {
      console.error('Table render error:', err);
      const contentArea = document.getElementById('history-content-area');
      if (contentArea) contentArea.innerHTML = `<div class="error-msg">Error al renderizar tabla: ${err.message}</div>`;
    }
  }

  async renderHistorySummary() {
    const contentArea = document.getElementById('history-content-area')
    if (!contentArea) return

    try {
      const summary = await this.loadSummaryData()

      contentArea.innerHTML = `
                ${this.renderPeriodSelector()}
                <div class="summary-cards-container">
                    <div class="summary-card card-billed">
                        <div class="summary-card-icon"><i class="fas fa-dollar-sign"></i></div>
                        <div class="card-info">
                            <span class="card-label">Total Facturado</span>
                            <span class="card-value">$${summary.total_billed.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="summary-card card-transactions">
                        <div class="summary-card-icon"><i class="fas fa-receipt"></i></div>
                        <div class="card-info">
                            <span class="card-label">Transacciones</span>
                            <span class="card-value">${summary.transaction_count}</span>
                        </div>
                    </div>
                    <div class="summary-card card-average">
                        <div class="summary-card-icon"><i class="fas fa-tag"></i></div>
                        <div class="card-info">
                            <span class="card-label">Ticket Promedio</span>
                            <span class="card-value">$${summary.average_ticket.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Payment Method Distribution Chart -->
                <div class="chart-container">
                    <h3 class="chart-title">Distribución por Método de Pago</h3>
                    <div class="chart-wrapper">
                        <canvas id="payment-method-chart"></canvas>
                    </div>
                </div>
            `

      // Render the payment method chart
      await this.renderPaymentMethodChart(summary)

    } catch (error) {
      contentArea.innerHTML = `<div class="error-msg">Error al cargar resumen: ${error.message}</div>`
    }
  }

  /**
   * ====================================================================
   * CHART RENDERING - PAYMENT METHOD DISTRIBUTION
   * ====================================================================
   */

  /**
   * Dynamically load Chart.js library if not already loaded
   */
  async loadChartJS() {
    if (this.chartJsLoaded || window.Chart) {
      this.chartJsLoaded = true
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = '../vendor/chartjs/chart.min.js'
      script.onload = () => {
        this.chartJsLoaded = true
        resolve()
      }
      script.onerror = () => reject(new Error('Failed to load Chart.js'))
      document.head.appendChild(script)
    })
  }

  /**
   * Render pie chart showing payment method breakdown
   * @param {Object} summary - Summary data containing payment totals
   */
  async renderPaymentMethodChart(summary) {
    try {
      // Load Chart.js if needed
      await this.loadChartJS()

      const canvas = document.getElementById('payment-method-chart')
      if (!canvas) return

      // Destroy existing chart instance to prevent memory leaks
      if (this.paymentChartInstance) {
        this.paymentChartInstance.destroy()
      }

      // Calculate totals by payment method
      const cashTotal = summary.total_cash || 0
      const transferTotal = summary.total_transfer || 0
      const total = cashTotal + transferTotal

      // Handle case when there's no data
      if (total === 0) {
        canvas.parentElement.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #94a3b8;">
            <i class="fas fa-chart-pie" style="font-size: 3rem; opacity: 0.3; margin-bottom: 12px;"></i>
            <p>No hay datos de ventas para este período</p>
          </div>
        `
        return
      }

      // Create the pie chart
      this.paymentChartInstance = new Chart(canvas, {
        type: 'pie',
        data: {
          labels: ['💵 Efectivo', '📱 Transferencia'],
          datasets: [{
            data: [cashTotal, transferTotal],
            backgroundColor: [
              '#10b981', // Green for Cash
              '#6366f1'  // Blue for Transfer
            ],
            borderColor: '#ffffff',
            borderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 20,
                font: {
                  size: 14,
                  weight: '600'
                },
                color: '#1e293b',
                usePointStyle: true,
                pointStyle: 'circle'
              }
            },
            tooltip: {
              backgroundColor: '#1e293b',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              padding: 12,
              cornerRadius: 8,
              displayColors: true,
              callbacks: {
                label: function (context) {
                  const label = context.label || ''
                  const value = context.parsed || 0
                  const percentage = ((value / total) * 100).toFixed(1)
                  return `${label}: $${value.toFixed(2)} (${percentage}%)`
                }
              }
            }
          }
        }
      })

    } catch (error) {
      console.error('Error rendering payment chart:', error)
    }
  }

  // Removed openSummaryMenu - Unifying Navigation

  async loadHistoryData() {
    // Prepare filters for RPC
    let dateTo = null
    if (this.historyFilters.dateTo) {
      const d = new Date(this.historyFilters.dateTo)
      d.setHours(23, 59, 59, 999)
      dateTo = d.toISOString()
    }

    const params = {
      p_search_query: this.historyFilters.search || null,
      p_status: this.historyFilters.status || null,
      p_date_from: this.historyFilters.dateFrom ? new Date(this.historyFilters.dateFrom).toISOString() : null,
      p_date_to: dateTo,
      p_min_amount: this.historyFilters.minAmount ? parseFloat(this.historyFilters.minAmount) : null,
      p_max_amount: this.historyFilters.maxAmount ? parseFloat(this.historyFilters.maxAmount) : null,
      p_sort_column: this.historySort.column,
      p_sort_direction: this.historySort.direction,
      p_limit: this.historyLimit,
      p_offset: this.historyPage * this.historyLimit
    }

    const { data, error } = await supabase.rpc('get_my_sales', params)
    if (error) throw error
    return data
  }

  async loadSummaryData() {
    const { data, error } = await supabase.rpc('get_my_sales_summary', {
      p_period: this.summaryPeriod
    })
    if (error) throw error

    // RPC returns a table (array), extract first row
    // Return default values if no data
    return data && data.length > 0 ? data[0] : {
      total_billed: 0,
      transaction_count: 0,
      average_ticket: 0,
      total_cash: 0,
      total_transfer: 0
    }
  }

  handleHistorySort(column) {
    if (this.historySort.column === column) {
      this.historySort.direction = this.historySort.direction === 'asc' ? 'desc' : 'asc'
    } else {
      this.historySort.column = column
      this.historySort.direction = 'desc' // Default new column to desc (usually what you want for amounts/dates)
    }
    this.renderHistoryList()
  }

  getSortIcon(column) {
    if (this.historySort.column !== column) return '<i class="fas fa-sort sort-icon"></i>'
    return this.historySort.direction === 'asc'
      ? '<i class="fas fa-sort-up sort-icon active"></i>'
      : '<i class="fas fa-sort-down sort-icon active"></i>'
  }

  /**
   * ====================================================================
   * TRANSACTION DETAILS DRAWER (READ-ONLY)
   * ====================================================================
   */
  async showTransactionDrawer(transactionId) {
    const drawer = document.getElementById('pos-transaction-drawer')
    const overlay = document.getElementById('pos-drawer-overlay')

    drawer.innerHTML = `
          <div style="padding: 30px; text-align: center;">
            <div class="spinner"></div>
            <p>Obteniendo detalles del ticket...</p>
          </div>
        `

    drawer.classList.add('open')
    overlay.classList.add('open')

    try {
      const { data: trans, error } = await supabase
        .from('transactions')
        .select(`
                    *,
                    profiles:seller_id(full_name),
                    transaction_items(
                        *,
                        products(name, sku, image_url),
                        product_variants(name)
                    )
                `)
        .eq('id', transactionId)
        .single()

      if (error) throw error

      const isVoided = trans.status === 'voided'

      drawer.innerHTML = `
                <div style="padding: 1.5rem; border-bottom: 1px solid var(--color-gray-100); display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1; min-width: 0;">
                        <h2 style="margin: 0; font-size: 1.2rem; color: var(--color-gray-800);">Detalle de Ticket</h2>
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                            <span style="font-family: monospace; font-size: 0.8rem; color: var(--color-gray-400);">#${trans.id.substring(0, 8)}</span>
                            <span style="color: var(--color-gray-300);">•</span>
                            <span style="font-size: 0.8rem; color: var(--color-primary-600); font-weight: 600;">👤 ${trans.profiles?.full_name || 'Desconocido'}</span>
                        </div>
                    </div>
                    <button onclick="window.cashierPosView.closeDrawer()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--color-gray-400);">&times;</button>
                </div>

                <div style="flex: 1; overflow-y: auto; padding: 1.5rem;">
                    <div style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                        <span class="badge ${isVoided ? 'badge-voided' : 'badge-completed'}">${isVoided ? 'ANULADA' : 'COMPLETADA'}</span>
                        <div style="text-align: right; font-size: 0.85rem; color: var(--color-gray-500);">
                            ${new Date(trans.created_at).toLocaleDateString()} ${new Date(trans.created_at).toLocaleTimeString()}
                        </div>
                    </div>

                    <div class="drawer-items-list" style="border-top: 1px solid var(--color-gray-100); padding-top: 1rem; display:flex; flex-direction:column; gap:10px;">
                        ${trans.transaction_items.map(item => {
        const prod = item.products || {};
        const name = prod.name || 'Producto desconocido';
        const image_url = prod.image_url;
        const variantName = item.product_variants ? item.product_variants.name : null;
        const qty = item.quantity;
        const price = item.price_at_sale;
        const subtotal = qty * price;

        // Thumbnail Logic (Consistent with Cart/Grid)
        const thumbnailContent = image_url ?
          `<img src="${image_url}" alt="${name}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;">` :
          `<div style="width:100%; height:100%; background:var(--color-gray-100); display:flex; align-items:center; justify-content:center; color:var(--color-gray-500); font-weight:700; border-radius:6px;">${name.charAt(0)}</div>`;

        return `
                            <div style="display: flex; gap: 12px; align-items: center; background: white; padding: 8px; border-radius: 8px; border: 1px solid var(--color-gray-100);">
                                <div style="width: 48px; height: 48px; flex-shrink: 0;">
                                    ${thumbnailContent}
                                </div>
                                
                                <div style="flex: 1; min-width: 0; display:flex; flex-direction:column; gap:2px;">
                                    <div style="font-weight: 600; color: var(--color-gray-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9rem;">${name}</div>
                                    ${variantName ? `<div style="font-size: 0.75rem; color: var(--color-primary-600); font-weight:500;">${variantName}</div>` : ''}
                                    <div style="font-size: 0.75rem; color: var(--color-gray-500);">
                                        $${price.toFixed(2)} x ${qty} u.
                                    </div>
                                </div>

                                <div style="text-align: right; flex-shrink: 0;">
                                    <div style="font-weight: 700; color: var(--color-gray-900); font-size: 1rem;">
                                        $${subtotal.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                </div>

                <div style="padding: 1.5rem; background: var(--color-gray-50); border-top: 1px solid var(--color-gray-100);">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 1.25rem; font-weight: 800; color: var(--color-gray-900);">
                        <span>TOTAL</span>
                        <span>$${trans.total_amount.toFixed(2)}</span>
                    </div>
                    ${isVoided && trans.void_reason ? `
                        <div style="margin-top: 1rem; padding: 0.75rem; background: #fff1f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 0.8rem; color: #b91c1c;">
                            <strong>Motivo de anulación:</strong><br>${trans.void_reason}
                        </div>
                    ` : ''}
                </div>

                <div style="padding: 1.5rem; border-top: 1px solid var(--color-gray-100); text-align: center;">
                    <p style="font-size: 0.75rem; color: var(--color-gray-400); margin: 0;">
                        Los cajeros no tienen permisos para anular transacciones.<br>
                        Contacte a un encargado si requiere corregir este ticket.
                    </p>
                </div>
            `
    } catch (error) {
      drawer.innerHTML = `<div style="padding: 30px; color: var(--color-error-500);">Error al cargar: ${error.message}</div>`
    }
  }

  closeDrawer() {
    document.getElementById('pos-transaction-drawer')?.classList.remove('open')
    document.getElementById('pos-drawer-overlay')?.classList.remove('open')
  }

  /**
   * Updates local in-memory stock after a successful sale to provide instant feedback.
   */
  updateLocalStockAfterSale() {
    this.cart.forEach(item => {
      const product = this.products.find(p => p.id === item.product.id);
      if (product) {
        const totalBaseQty = item.quantity * (item.factor || 1);
        product.stock -= totalBaseQty;
        // Trigger visual flash on the specific card
        this.flashProductCard(product.id);
      }
    });

    // Final re-render of the product grid with new stock levels
    this.renderProducts();
  }
}
