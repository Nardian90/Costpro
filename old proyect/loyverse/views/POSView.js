import { supabase } from '../supabaseClient.js'
import { SaleService } from '../../services/sale.service.js'
// import { InventoryListener } from '../../services/inventory.listener.js' // Removed as we use direct subscription
import ViewHeader from '../../ui/components/ViewHeader.js'

export default class POSView {
  constructor(container) {
    this.container = container
    this.cart = []
    this.products = []
    this.variants = []
    this.storeId = null
    this.userProfile = null
    this.saleService = null
    // this.inventoryListener = null // No longer using this for stock
    this.realtimeChannel = null
  }

  async render() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    this.userProfile = profile
    this.storeId = profile?.store_id

    // Initialize Services
    if (this.storeId) {
      this.saleService = new SaleService(this.storeId, this.userProfile.id);
      // this.inventoryListener = new InventoryListener(this.storeId);
    }

    this.container.innerHTML = `
      <div class="pos-panel">
        ${(window.loyApp.updateNavTitle('Cajero (Legacy)'), '')}
        ${!this.storeId ? '<div class="error-msg">Error: No tienes tienda asignada</div>' : ''}
        
        <div class="product-grid-section">
            <div class="pos-header">
              <div class="search-input-wrapper">
                <i class="fas fa-search search-icon" aria-hidden="true"></i>
                <input type="text" id="pos-search" placeholder="Buscar producto (SKU/Nombre)..." aria-label="Buscar" />
              </div>
            </div>
           <div id="pos-products" class="products-container">Cargando productos...</div>
        </div>

        <div class="cart-panel">
           <h3>Ticket de Venta</h3>
           <div id="cart-items" class="cart-items-list">
              <div class="empty-cart">Ticket vacío</div>
           </div>
           
           <div class="cart-summary">
              <div class="summary-row">
                <span>Total Items:</span>
                <span id="cart-count">0</span>
              </div>
              <div class="summary-row total">
                <span>Total a Pagar:</span>
                <span id="cart-total">$0.00</span>
              </div>
           </div>
           
           <button id="btn-checkout" class="loy-btn-primary btn-checkout" disabled>COBRAR</button>
        </div>
      </div>
    `

    // Inject consistency styles for legacy view
    this.injectStyles();

    if (this.storeId) {
      await this.loadProducts()
      this.setupSearch()
      this.setupRealtime()
      document.getElementById('btn-checkout').onclick = () => this.handleCheckout()
    }
  }

  setupRealtime() {
    // Subscribe to REALTIME changes on 'products' table for Stock & Price updates
    if (this.realtimeChannel) return;

    this.realtimeChannel = supabase
      .channel('pos-products-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        (payload) => {
          const updatedProduct = payload.new;

          // Update local state
          const index = this.products.findIndex(p => p.id === updatedProduct.id);
          if (index !== -1) {
            // Update fields
            this.products[index].stock = updatedProduct.stock_current ?? 0;
            this.products[index].price = updatedProduct.price;
            this.products[index].name = updatedProduct.name;

            // Refresh View (preserving search if active)
            this.refreshProductView();
          }
        }
      )
      .subscribe();
  }

  refreshProductView() {
    const searchInput = document.getElementById('pos-search');
    const term = searchInput ? searchInput.value.toLowerCase() : '';

    let filtered = this.products;
    if (term) {
      filtered = this.products.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.sku && p.sku.toLowerCase().includes(term))
      );
    }
    this.renderProducts(filtered);
  }

  async loadProducts() {
    // 1. Fetch data directly from products, assuming store_id filter if implied, 
    // but originally it was all. We will stick to the requested mapping:
    // "Existencia" -> products.stock_current

    // We filter by store_id if the column exists and user profile has one, 
    // to match standard SAAS logic, though original code fetched all.
    // Safety check: if products table has store_id, use it.

    const { data: products } = await supabase
      .from('products')
      .select('*')
    // .eq('store_id', this.storeId) // Enforce store context (Disabled to match WarehouseView)

    const { data: variants } = await supabase.from('product_variants').select('*')

    this.variants = variants || [];

    // 2. Prepare Data
    this.products = (products || []).map(p => {
      const pVariants = this.variants.filter(v => v.product_id === p.id)

      return {
        ...p,
        stock: p.stock_current ?? 0, // Direct mapping as requested
        variants: pVariants
      }
    })

    this.renderProducts(this.products)
  }

  renderProducts(productsToRender) {
    const container = document.getElementById('pos-products')
    if (productsToRender.length === 0) {
      container.innerHTML = '<div>No se encontraron productos</div>'
      return
    }

    container.innerHTML = productsToRender.map(p => {
      // Price Formatting logic: $ and 2 decimals
      const basePrice = parseFloat(p.price);
      let displayPrice = '';

      if (p.variants.length > 0) {
        const minVarPrice = Math.min(basePrice, ...p.variants.map(v => v.price));
        displayPrice = `Desde $${minVarPrice.toFixed(2)}`;
      } else {
        displayPrice = `$${basePrice.toFixed(2)}`;
      }

      // Stock Visual Logic
      // Green: >= 5 (Sufficient)
      // Orange: < 5 (Low)
      // Red: <= 0 (Out)
      let stockClass = 'stock-ok';
      let stockLabelColor = '#10b981'; // Green default

      if (p.stock <= 0) {
        stockClass = 'stock-out';
        stockLabelColor = '#ef4444'; // Red
      } else if (p.stock < 5) {
        stockClass = 'stock-low';
        stockLabelColor = '#f59e0b'; // Orange
      }

      return `
        <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" 
             data-product-id="${p.id}"
             onclick="window.posView.selectProduct('${p.id}')">
            <div class="prod-name">${p.name}</div>
            <div class="prod-price">
                ${displayPrice}
            </div>
            <div class="prod-stock stock-display" 
                 id="stock-display-${p.id}" 
                 style="color: ${stockLabelColor}; font-weight: bold;">
                Stock: ${p.stock}
            </div>
            ${p.variants.length > 0 ? '<div style="font-size:0.7em; color:#666;">Variantes disp.</div>' : ''}
        </div>
      `
    }).join('')

    window.posView = this
  }

  setupSearch() {
    document.getElementById('pos-search').addEventListener('input', (e) => {
      this.refreshProductView();
    })
  }

  async selectProduct(productId) {
    const product = this.products.find(p => p.id === productId);

    // If no variants, add base product directly
    if (!product.variants || product.variants.length === 0) {
      this.addToCart(product, null); // null variant means 'Base Unit'
      return;
    }

    // If variants exist, show selection modal
    const options = [
      { name: `Unidad (${product.name})`, price: product.price, id: 'base', factor: 1 },
      ...product.variants.map(v => ({ name: v.name, price: v.price, id: v.id, factor: v.conversion_factor }))
    ];

    const { value: selectedVariantId } = await Swal.fire({
      title: `Seleccionar Presentación`,
      input: 'radio',
      inputOptions: options.reduce((acc, opt) => {
        acc[opt.id] = `${opt.name} - $${parseFloat(opt.price).toFixed(2)}`;
        return acc;
      }, {}),
      inputValue: 'base', // Default
      showCancelButton: true,
    });

    if (selectedVariantId) {
      const selectedOption = options.find(o => o.id === selectedVariantId);
      this.addToCart(product, selectedOption);
    }
  }

  async addToCart(product, variantOption) {
    // 1. VALIDATION: Check DB Stock Real-time
    try {
      const { data: freshProduct, error } = await supabase
        .from('products')
        .select('stock_current')
        .eq('id', product.id)
        .single();

      if (freshProduct) {
        // Sync local stock immediately
        product.stock = freshProduct.stock_current ?? 0;
        // Update UI reflected
        this.refreshProductView();
      }
    } catch (e) {
      console.error("Stock check failed", e);
    }

    if (product.stock <= 0) {
      return Swal.fire('Agotado', 'Este producto no tiene stock disponible.', 'error');
    }

    // Resolve details
    const isBase = !variantOption || variantOption.id === 'base';
    const price = isBase ? product.price : variantOption.price;
    const variantId = isBase ? null : variantOption.id;
    const factor = isBase ? 1 : variantOption.factor;
    const variantName = isBase ? null : variantOption.name;

    // Check stock availability (considering conversion factor and current cart)
    const currentCartUsage = this.cart.reduce((sum, item) => {
      if (item.product.id === product.id) {
        return sum + (item.quantity * item.factor)
      }
      return sum;
    }, 0);

    if (currentCartUsage + factor > product.stock) {
      return Swal.fire('Stock Insuficiente', `Solo quedan ${product.stock} unidades.`, 'warning');
    }

    const existing = this.cart.find(item => item.product.id === product.id && item.variantId === variantId);

    if (existing) {
      existing.quantity++
    } else {
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
  }

  renderCart() {
    const container = document.getElementById('cart-items')
    if (this.cart.length === 0) {
      container.innerHTML = '<div class="empty-cart">Ticket vacío</div>'
      document.getElementById('btn-checkout').disabled = true
      this.updateTotals()
      return
    }

    container.innerHTML = this.cart.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.product.name} ${item.variantName ? `<small>(${item.variantName})</small>` : ''}</div>
                <div class="cart-item-price">$${parseFloat(item.price).toFixed(2)} x ${item.quantity}</div>
            </div>
            <div class="cart-item-actions">
                <div class="cart-item-total">$${(item.price * item.quantity).toFixed(2)}</div>
                <button class="btn-remove" onclick="window.posView.removeFromCart(${index})">X</button>
            </div>
        </div>
      `).join('')

    document.getElementById('btn-checkout').disabled = false
    this.updateTotals()
  }

  removeFromCart(index) {
    this.cart.splice(index, 1)
    this.renderCart()
  }

  updateTotals() {
    const count = this.cart.reduce((sum, item) => sum + item.quantity, 0)
    const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

    document.getElementById('cart-count').textContent = count
    document.getElementById('cart-total').textContent = '$' + total.toFixed(2)
  }

  async handleCheckout() {
    const totalAmount = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

    const { isConfirmed } = await Swal.fire({
      title: 'Confirmar Venta',
      text: `Total: $${totalAmount.toFixed(2)}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'COBRAR'
    });

    if (!isConfirmed) return;

    const btn = document.getElementById('btn-checkout')
    btn.textContent = 'Procesando...'
    btn.disabled = true

    try {
      // Delegate completely to SaleService
      const result = await this.saleService.processSale(this.cart);

      await Swal.fire('Éxito', 'Venta realizada correctamente', 'success');
      this.cart = []
      this.renderCart()

      // Refresh local data just in case
      this.loadProducts();

    } catch (err) {
      Swal.fire('Error Transactional', err.message, 'error');
    } finally {
      btn.textContent = 'COBRAR'
      btn.disabled = false
    }
  }

  injectStyles() {
    if (document.getElementById('pos-legacy-styles')) return;
    const style = document.createElement('style');
    style.id = 'pos-legacy-styles';
    style.innerHTML = `
      .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
          margin-bottom: 1rem;
      }
      .search-input-wrapper .search-icon {
          position: absolute;
          left: 10px;
          color: #94a3b8;
          pointer-events: none;
          z-index: 1;
      }
      .search-input-wrapper input {
          width: 100%;
          padding: 10px 12px 10px 36px !important;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s;
      }
      .search-input-wrapper input:focus {
          border-color: #6366f1;
      }
      /* Stock Colors */
      .stock-ok { color: #10b981; }
      .stock-low { color: #f59e0b; }
      .stock-out { color: #ef4444; }
    `;
    document.head.appendChild(style);
  }

  destroy() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
    }
  }
}
