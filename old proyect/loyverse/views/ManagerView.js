import { supabase } from '../supabaseClient.js'
import AdvancedTable from '../components/AdvancedTable.js'
import ViewHeader from '../../ui/components/ViewHeader.js'

/**
 * ManagerView - Panel Gerencial para Retail
 * Especializado en gestión de inventario, ventas y variantes.
 */
export default class ManagerView {
    constructor(container) {
        this.container = container;
        this.storeId = null;
        this.activeTab = 'dashboard';
        this.refreshInterval = null;
        this.profile = null;
        this.isGlobalAdmin = false;
        this.historyFilter = 'all'; // 'all' o 'personal'

        // Exponer a ventana global para eventos inline
        window.managerView = this;
        this.injectCSS();
    }

    /**
     * Inicialización principal
     */
    async render() {
        try {
            this.showMainLoader();

            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) throw new Error('Usuario no autenticado');

            const { data: profile, error: profError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profError) throw profError;

            this.profile = profile;
            this.storeId = profile.store_id;
            this.isGlobalAdmin = !this.storeId;

            // 1. Set Title & Mobile Nav
            window.loyApp.updateNavTitle('Encargado');

            this.renderLayout();
            this.renderNavAction(); // Centralized sandwich button
            this.setupRealtime();
            this.startAutoRefresh();

            // Render inicial del dashboard
            await this.renderTab('dashboard');

        } catch (error) {
            console.error('Error rendering ManagerView:', error);
            this.container.innerHTML = `
        <div class="error-container" style="padding: 40px; text-align: center;">
          <h2 style="color: var(--theme-error);">Error de Acceso</h2>
          <p>${error.message}</p>
          <button class="loy-btn-primary" onclick="location.reload()">Reintentar</button>
        </div>
      `;
        }
    }

    /**
     * Estructura base del panel
     */
    renderLayout() {
        this.container.innerHTML = `
      <div class="manager-enterprise-layout">
        <!-- SIDE MENU DRAWER (Sandwich Menu) -->
        <div id="manager-menu-overlay" class="drawer-overlay" onclick="window.managerView.toggleMobileMenu()"></div>
        <div id="manager-side-menu" class="pos-side-menu">
            <div class="menu-header">
                <h3>Panel Encargado</h3>
                <button onclick="window.managerView.toggleMobileMenu()">&times;</button>
            </div>
            <div class="menu-items">
                <button id="nav-dashboard" class="menu-item ${this.activeTab === 'dashboard' ? 'active' : ''}" onclick="window.managerView.navigateTo('dashboard')">
                    <i class="fas fa-chart-line"></i> Dashboard
                </button>
                <button id="nav-catalog" class="menu-item ${this.activeTab === 'catalog' ? 'active' : ''}" onclick="window.managerView.navigateTo('catalog')">
                    <i class="fas fa-box-open"></i> Catálogo
                </button>
                <button id="nav-history" class="menu-item ${this.activeTab === 'history' ? 'active' : ''}" onclick="window.managerView.navigateTo('history')">
                    <i class="fas fa-history"></i> Historial
                </button>
                <button id="nav-inventory_report" class="menu-item ${this.activeTab === 'inventory_report' ? 'active' : ''}" onclick="window.managerView.navigateTo('inventory_report')">
                    <i class="fas fa-funnel-dollar"></i> Rentabilidad
                </button>
                <button id="nav-audit" class="menu-item ${this.activeTab === 'audit' ? 'active' : ''}" onclick="window.managerView.navigateTo('audit')">
                    <i class="fas fa-eye"></i> Auditoría
                </button>
                <button id="nav-closure" class="menu-item ${this.activeTab === 'closure' ? 'active' : ''}" onclick="window.managerView.navigateTo('closure')">
                    <i class="fas fa-cash-register"></i> Cierre Caja
                </button>
            </div>
            <div class="menu-footer">
                <span class="user-badge">${this.profile?.full_name || 'Encargado'}</span>
            </div>
        </div>
        
        <main id="manager-content" class="manager-enterprise-content">
          <div id="manager-view-dynamic-container">
            <!-- Dynamically injected -->
          </div>
        </main>

        <div id="drawer-overlay" class="drawer-overlay" onclick="window.managerView.closeDrawer()"></div>
        <div id="transaction-drawer" class="transaction-drawer"></div>
      </div>
    `;
    }

    /**
     * Renders the hamburger menu button in the global navbar
     */
    renderNavAction() {
        const slot = document.getElementById('loy-nav-action-slot');
        if (slot) {
            slot.innerHTML = `
                <button class="loy-btn-icon" onclick="window.managerView.toggleMobileMenu()" title="Menú">
                    <i class="fas fa-bars"></i>
                </button>
            `;
        }
    }

    /**
     * Centralized Navigation Handler
     */
    navigateTo(tab) {
        this.toggleMobileMenu(); // Close menu
        if (this.activeTab === tab) return;

        // Update active class in menu
        this.container.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`nav-${tab}`);
        if (activeBtn) activeBtn.classList.add('active');

        this.activeTab = tab;
        this.renderTab(tab);
    }

    /**
     * Toggles the side menu visibility
     */
    toggleMobileMenu() {
        const menu = document.getElementById('manager-side-menu');
        const overlay = document.getElementById('manager-menu-overlay');
        if (menu && overlay) {
            menu.classList.toggle('open');
            overlay.classList.toggle('open');
        }
    }

    /**
     * Suscripciones Realtime para datos vivos
     */
    setupRealtime() {
        // Limpiar canal anterior si existe
        if (this.managerChannel) {
            supabase.removeChannel(this.managerChannel);
        }

        this.managerChannel = supabase
            .channel('manager-updates')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
                if (this.activeTab === 'dashboard' || this.activeTab === 'history' || this.activeTab === 'inventory_report') {
                    // Si es de nuestra tienda (o somos admin global), refrescar visualmente
                    console.log("Notificación Realtime - Nueva Transacción:", payload.new);
                    if (this.isGlobalAdmin || payload.new.store_id === this.storeId) {
                        this.refreshCurrentView();
                    }
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, (payload) => {
                if (this.activeTab === 'catalog') {
                    const productId = payload.new?.product_id || payload.old?.product_id;
                    if (productId) this.updateProductRow(productId);
                }
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'inventory',
                filter: `store_id=eq.${this.storeId}`
            }, (payload) => {
                if (this.activeTab === 'catalog' || this.activeTab === 'dashboard') {
                    // Update the catalog if stock changed
                    const productId = payload.new?.product_id || payload.old?.product_id;
                    if (productId) this.updateProductRow(productId);

                    // Also refresh dashboard KPIs if on dashboard
                    if (this.activeTab === 'dashboard') this.loadStats();
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
                if (this.activeTab === 'catalog') {
                    this.updateProductRow(payload.new?.id || payload.old?.id);
                }
            })
            .subscribe();
    }

    /**
     * Temporizador de refresco automático
     */
    startAutoRefresh() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(() => {
            if (this.activeTab === 'dashboard') {
                this.loadStats();
            }
        }, 10000);
    }

    /**
     * Renderizado de contenido por pestaña
     */
    async renderTab(tabName) {
        const content = document.getElementById('manager-view-dynamic-container');
        if (!content) return;

        content.innerHTML = `
      <div class="loading-spinner-container">
        <div class="spinner"></div>
        <p>Actualizando información...</p>
      </div>
    `;

        try {
            switch (tabName) {
                case 'dashboard':
                    await this.renderDashboard(content);
                    break;
                case 'catalog':
                    await this.renderCatalog(content);
                    break;
                case 'history':
                    await this.renderHistory(content);
                    break;
                case 'inventory_report':
                    await this.renderInventoryReport(content);
                    break;
                case 'audit':
                    await this.renderAudit(content);
                    break;
                case 'closure':
                    await this.renderClosure(content);
                    break;
            }
        } catch (error) {
            content.innerHTML = `<div class="error">Error al cargar datos: ${error.message}</div>`;
        }
    }

    /**
     * Lógica de refresco sin perder estado de UI pesado
     */
    refreshCurrentView() {
        if (this.activeTab === 'dashboard') {
            this.loadStats();
        } else if (this.activeTab === 'history') {
            // Refresh historial cuando nueva transacción es insertada
            if (this.historyTable) {
                this.historyTable.refresh();
            }
        } else if (this.activeTab === 'inventory_report' && this.inventoryReportTable) {
            this.inventoryReportTable.refresh();
        }
        // En catálogo no forzamos refresh total para no interrumpir modales o scroll
    }

    // ==========================================
    // DASHBOARD SECTION
    // ==========================================

    async renderDashboard(container) {
        container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card kpi--sales">
          <div class="kpi-label">Venta Hoy (Bruta)</div>
          <div id="dash-kpi-sales" class="kpi-value">$0.00</div>
          <div class="kpi-subtext">Ingresos registrados hoy</div>
        </div>
        <div class="kpi-card kpi--cost">
          <div class="kpi-label">Costo de Mercancía</div>
          <div id="dash-kpi-cost" class="kpi-value">$0.00</div>
          <div class="kpi-subtext">Costo base de lo vendido hoy</div>
        </div>
        <div id="dash-kpi-profit-card" class="kpi-card kpi--profit">
          <div class="kpi-label">Utilidad del Día</div>
          <div id="dash-kpi-profit" class="kpi-value">$0.00</div>
          <div class="kpi-subtext">Ganancia neta estimada</div>
        </div>
      </div>
    `;
        this.loadStats();
    }

    async loadStats() {
        try {
            const { data: kpis, error } = await supabase.rpc('get_dashboard_kpis', {
                p_store_id: this.storeId
            });

            if (error) throw error;

            const s = document.getElementById('dash-kpi-sales');
            const c = document.getElementById('dash-kpi-cost');
            const p = document.getElementById('dash-kpi-profit');
            const pc = document.getElementById('dash-kpi-profit-card');

            if (s) s.textContent = this.formatCurrency(kpis.gross_sales);
            if (c) c.textContent = this.formatCurrency(kpis.cost_of_goods);
            if (p) {
                p.textContent = this.formatCurrency(kpis.profit);
                if (pc) {
                    pc.classList.toggle('negative', kpis.profit < 0);
                    pc.classList.toggle('positive', kpis.profit > 0);
                }
            }
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }



    // ==========================================
    // CATALOG SECTION
    // ==========================================

    async renderCatalog(container) {
        if (!container) return;
        container.innerHTML = `<div id="catalog-table-wrapper" style="height: calc(100vh - 200px);"></div>`;

        this.catalogTable = new AdvancedTable({
            container: document.getElementById('catalog-table-wrapper'),
            id: 'managerCatalogTable',
            title: 'Inventario y Catálogo',
            columns: [
                {
                    key: 'name',
                    label: 'Producto / Categoría',
                    sortable: true,
                    formatter: (val, row) => `
                        <div style="font-weight: 700; color: #1e293b;">${val}</div>
                        <div style="font-size: 0.75rem; color: #64748b;">${row.category || 'Sin categoría'}</div>
                    `
                },
                {
                    key: 'quantity',
                    label: 'Existencia',
                    align: 'center',
                    sortable: true,
                    formatter: (val) => `
                        <span class="stock-pill ${val <= 10 ? 'low' : 'ok'}" style="padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; background: ${val <= 10 ? '#fee2e2' : '#f1f5f9'}; color: ${val <= 10 ? '#b91c1c' : '#475569'};">
                            ${val || 0} <small style="font-weight:400; opacity:0.7">un</small>
                        </span>
                    `
                },
                {
                    key: 'cost_price',
                    label: 'Costo Unit.',
                    align: 'right',
                    sortable: true,
                    formatter: (val) => this.formatCurrency(val)
                },
                {
                    key: 'total_cost',
                    label: 'Valor Total',
                    align: 'right',
                    sortable: true,
                    formatter: (val) => `<strong style="color: #0f172a">${this.formatCurrency(val)}</strong>`
                },
                {
                    key: 'product_variants',
                    label: 'Variantes',
                    align: 'center',
                    formatter: (val) => {
                        const count = (Array.isArray(val) ? val[0]?.count : val?.count) || 0;
                        return `<span class="adv-table-badge ${count > 0 ? 'badge-success' : 'badge-default'}">
                            ${count > 0 ? `${count} variantes` : 'Unidad base'}
                        </span>`;
                    }
                },
                {
                    key: 'id',
                    label: 'Acciones',
                    align: 'right',
                    formatter: (val, row) => `
                        <div style="display: flex; gap: 8px; justify-content: flex-end;">
                            <button class="loy-btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.managerView.manageVariants('${row.id}', '${row.name.replace(/'/g, "\\'")}')">
                                <i class="fas fa-layer-group"></i> Variantes
                            </button>
                            <button class="loy-btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: #6366f1; color: #6366f1;" onclick="window.managerView.showProductLedger('${row.id}', '${row.name.replace(/'/g, "\\'")}', '${row.sku || 'N/A'}')">
                                <i class="fas fa-history"></i> Kárdex
                            </button>
                        </div>
                    `
                }
            ],
            filters: [
                { key: 'search', label: 'Búsqueda', type: 'text', placeholder: 'Buscar por nombre o SKU...' }
            ],
            summaryFields: [
                { label: 'Productos', key: 'id', type: 'count' },
                { label: 'Valorización Total', key: 'total_cost', type: 'sum', format: 'currency' }
            ],
            fetchData: async (filters, sort) => {
                // DIRECT QUERY TO PRODUCTS (Aligned with WarehouseView Source of Truth)
                const { data, error } = await supabase
                    .from('products')
                    .select('*, stock_current');

                if (error) throw error;

                // Cargar también el conteo de variantes
                const { data: varCounts } = await supabase.rpc('get_product_variants_counts');
                const varMap = (varCounts || []).reduce((acc, curr) => {
                    acc[curr.product_id] = curr.count;
                    return acc;
                }, {});

                let results = (data || []).map(p => ({
                    ...p,
                    product_id: p.id,
                    quantity: p.stock_current || 0,
                    total_cost: (p.stock_current || 0) * (p.cost_price || 0),
                    profit_per_unit: (p.price || 0) - (p.cost_price || 0),
                    product_variants: { count: varMap[p.id] || 0 },
                    // Ensure category exists
                    category: p.category || 'General'
                }));

                if (filters.search) {
                    const s = filters.search.toLowerCase();
                    results = results.filter(i =>
                        i.name.toLowerCase().includes(s) ||
                        (i.sku && i.sku.toLowerCase().includes(s))
                    );
                }

                if (sort.column) {
                    results.sort((a, b) => {
                        let vA = a[sort.column];
                        let vB = b[sort.column];
                        if (typeof vA === 'string') {
                            return sort.direction === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
                        }
                        return sort.direction === 'asc' ? (vA - vB) : (vB - vA);
                    });
                }

                return results;
            },
            onRowClick: (row) => this.showProductLedger(row.id, row.name, row.sku || 'N/A'),

            mobileCardRenderer: (row, idx) => {
                const qty = Number(row.quantity) || 0;
                const profit = Number(row.profit_per_unit) || 0;
                const status = qty <= 0 ? 'red' : (qty < 10 ? 'orange' : 'green');
                const statusLabel = qty <= 0 ? 'Agotado' : (qty < 10 ? 'Bajo' : 'OK');

                return `
                    <div class="adv-mobile-card" style="flex-direction: column; align-items: stretch; padding: 16px; gap: 10px; position:relative; overflow: visible;" onclick="window['managerCatalogTable'].handleRowClick(${idx})">
                        
                        <!-- Header: Profit Badge + Menu Button -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <div style="background: ${profit >= 0 ? '#10b981' : '#ef4444'}; color: white; padding: 4px 14px; border-radius: 10px; font-size: 0.7rem; font-weight: 800; box-shadow: 0 4px 12px ${profit >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'};">
                                <i class="fas ${profit >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}" style="margin-right: 6px;"></i>
                                GANANCIA: ${profit >= 0 ? '+' : ''}${this.formatCurrency(profit)}
                            </div>

                            <button class="card-pro-menu-btn" style="background:#f1f5f9; border:none; color:#475569; font-size:1rem; padding: 0; border-radius: 10px; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onclick="event.stopPropagation(); window.managerView.openMobileMenu('${row.id}')">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                        </div>

                        <!-- Product Info Row -->
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <div class="card-thumbnail-wrapper" style="width: auto; padding: 0;">
                                 <div style="width: 48px; height: 48px; background: #f8fafc; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; border: 1px solid #f1f5f9;">
                                    📦
                                 </div>
                            </div>
                            <div class="card-info" style="flex: 1; min-width: 0;">
                                <div class="card-name" style="font-weight: 800; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1rem;">${row.name}</div>
                                <div class="card-meta" style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">${row.sku || 'N/A'} • ${row.category || 'Sin Cat.'}</div>
                                <div style="display:flex; gap: 8px; margin-top: 2px;">
                                    <div style="font-size: 0.8rem; color: #135bec; font-weight: 800;">${this.formatCurrency(row.selling_price)}</div>
                                    <div style="font-size: 0.8rem; color: #cbd5e1;">|</div>
                                    <div style="font-size: 0.8rem; color: #64748b; font-weight: 600;">${this.formatCurrency(row.cost_price)} <small style="font-size: 0.65rem; color:#cbd5e1;">costo</small></div>
                                </div>
                            </div>
                            <div class="card-stock-wrapper" style="text-align: right;">
                                <div style="font-size: 1.25rem; font-weight: 900; color: ${status === 'red' ? '#ef4444' : (status === 'orange' ? '#f59e0b' : '#1e293b')}">${qty}<small style="font-size:0.65rem; color:#94a3b8; font-weight:700; margin-left:2px;">u</small></div>
                                <div style="font-size: 0.6rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Existencia</div>
                            </div>
                        </div>

                    </div>
                `;
            }
        });

        await this.catalogTable.render();
    }

    // Obsolete Catalog helpers removed

    // ==========================================
    // VARIANT MANAGEMENT (SweetAlert2)
    // ==========================================

    async manageVariants(productId, productName, mode = 'full') {
        Swal.fire({
            title: 'Cargando...',
            didOpen: () => { Swal.showLoading(); }
        });

        // Fetch variants and current product data (Base price + Cost for margin)
        const [variantsRes, productRes] = await Promise.all([
            supabase.from('product_variants').select('*').eq('product_id', productId).order('conversion_factor', { ascending: true }),
            supabase.from('products').select('price, cost_average, cost_price').eq('id', productId).single()
        ]);

        if (variantsRes.error) {
            Swal.fire('Error', 'No se pudieron cargar las variantes', 'error');
            return;
        }

        const variants = variantsRes.data || [];
        const basePrice = productRes.data?.price || 0;
        const currentCost = productRes.data?.cost_average || productRes.data?.cost_price || 0;

        const renderVariantsTable = () => {
            if (variants.length === 0) {
                return '<p style="color: #94a3b8; font-style: italic; margin: 10px 0; font-size: 0.9rem;">Sin variantes adicionales. Se vende por unidad base.</p>';
            }
            return `
        <div style="max-height: 200px; overflow-y: auto; margin-top: 5px; border: 1px solid #e2e8f0; border-radius: 12px; background: white;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85em; text-align: left;">
            <thead style="background: #f8fafc; position: sticky; top: 0; z-index: 1;">
              <tr>
                <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Nombre</th>
                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #e2e8f0;">Factor</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #e2e8f0;">Precio</th>
                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #e2e8f0;"></th>
              </tr>
            </thead>
            <tbody>
              ${variants.map(v => `
                <tr style="border-top: 1px solid #f1f5f9;">
                  <td style="padding: 10px;"><b>${v.name}</b><br><small style="color:#94a3b8">${v.sku || 'Sin SKU'}</small></td>
                  <td style="padding: 10px; text-align: center;">x${v.conversion_factor}</td>
                  <td style="padding: 10px; text-align: right; color: #10b981; font-weight: 700;">$${v.price.toLocaleString()}</td>
                  <td style="padding: 10px; text-align: center;">
                    <button class="btn-ent btn-ent--sm" style="color: #ef4444; border: 1px solid #fee2e2; background: #fff1f2; border-radius: 6px; padding: 4px 8px;" onclick="window.managerView.deleteVariant('${v.id}', '${productId}', '${productName}')">
                      <i class="fas fa-trash-alt"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
        };

        Swal.fire({
            title: `<div style="text-align: left; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">
                <span style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800;">${mode === 'price_only' ? 'Precio de Venta' : 'Gestión de Catálogo'}</span><br>
                <span style="font-size: 0.95rem; color: #1e293b; font-weight: 800;">${productName}</span>
            </div>`,
            html: `
        <div style="display: flex; flex-direction: column; gap: 1.25rem; text-align: left; margin-top: 1rem;">
          
          <!-- SECTION 1: PRECIO BASE -->
          <div style="padding: 1.25rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
               <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800;">1</div>
                  <h4 style="margin: 0; font-size: 0.9em; color: #334155; font-weight: 700;">Unidad Base</h4>
               </div>
               <div id="v-margin-badge" style="background:#dcfce7; color:#166534; font-size:0.65rem; font-weight:800; padding:4px 8px; border-radius:6px; border:1px solid #bbf7d0;">
                  MARGEN: --%
               </div>
            </div>
            
            <div class="form-group">
              <label for="v-base-price" style="display: block; font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Precio Actual</label>
              <div style="position: relative;">
                <span style="position: absolute; left: 12px; top: 12px; font-weight: 800; color: #64748b;">$</span>
                <input id="v-base-price" type="number" class="swal2-input" value="${basePrice}" style="margin: 0; width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 800; font-size: 1.1rem; height: 45px; padding-left: 28px;">
              </div>
            </div>
            
            <div style="margin-top: 10px; font-size: 0.75rem; color: #94a3b8; display: flex; justify-content: space-between;">
                <span>Costo Promedio:</span>
                <span style="font-weight: 700; color: #475569;">${this.formatCurrency(currentCost)}</span>
            </div>
          </div>

          ${mode === 'full' ? `
          <!-- SECTION 2: LISTA (Solo modo full) -->
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <h4 style="margin: 0; font-size: 0.85em; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Variantes Registradas</h4>
            ${renderVariantsTable()}
          </div>

          <!-- SECTION 3: NUEVA VARIANTE (Solo modo full) -->
          <div style="background: #ffffff; padding: 1.25rem; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 1.25rem;">
               <div style="width: 24px; height: 24px; background: #10b981; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800;">2</div>
               <h4 style="margin: 0; font-size: 0.9em; color: #334155; font-weight: 700;">Agregar Nueva Variante</h4>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
              <div class="form-group">
                <label for="v-name" style="display: block; font-size: 0.75rem; color: #475569; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Nombre (ej. Pack x6)</label>
                <input id="v-name" class="swal2-input" placeholder="Nombre de la variante" style="margin: 0; width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; height: 40px;">
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
                <div class="form-group">
                  <label for="v-sku" style="display: block; font-size: 0.75rem; color: #475569; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">SKU (Opcional)</label>
                  <input id="v-sku" class="swal2-input" placeholder="Código" style="margin: 0; width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; height: 40px;">
                </div>
                <div class="form-group">
                  <label for="v-factor" style="display: block; font-size: 0.75rem; color: #475569; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Factor (Multiplicador)</label>
                  <input id="v-factor" type="number" class="swal2-input" placeholder="1" style="margin: 0; width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 700; height: 40px;">
                </div>
              </div>

              <div class="form-group" style="background: #f0fdf4; padding: 12px; border-radius: 10px; border: 1px solid #bbf7d0;">
                <label for="v-price" style="display: block; font-size: 0.75rem; color: #166534; font-weight: 800; margin-bottom: 6px; text-transform: uppercase;">Precio Sugerido Variante</label>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.4rem; font-weight: 800; color: #10b981;">$</span>
                    <input id="v-price" type="number" class="swal2-input" placeholder="0.00" style="margin: 0; width: 100%; border: none; border-bottom: 2px solid #10b981; border-radius: 0; font-weight: 800; font-size: 1.3rem; color: #15803d; background: transparent; height: 40px;">
                </div>
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      `,
            showCancelButton: true,
            confirmButtonText: mode === 'price_only' ? '<i class="fas fa-save"></i> Actualizar Precio Base' : '<i class="fas fa-save"></i> Guardar Cambios',
            cancelButtonText: 'Cerrar',
            confirmButtonColor: '#10b981',
            width: '600px',
            didOpen: () => {
                const bPrice = document.getElementById('v-base-price');
                const vFactor = document.getElementById('v-factor');
                const vPrice = document.getElementById('v-price');
                const mBadge = document.getElementById('v-margin-badge');

                const updateMargin = () => {
                    const price = parseFloat(bPrice.value) || 0;
                    if (price > 0 && currentCost > 0) {
                        const margin = ((price - currentCost) / price) * 100;
                        mBadge.innerText = `MARGEN: ${margin.toFixed(1)}%`;
                        mBadge.style.background = margin > 0 ? '#dcfce7' : '#fee2e2';
                        mBadge.style.color = margin > 0 ? '#166534' : '#991b1b';
                    } else {
                        mBadge.innerText = `MARGEN: --%`;
                        mBadge.style.background = '#dcfce7';
                        mBadge.style.color = '#166534';
                    }
                };

                const calc = () => {
                    const base = parseFloat(bPrice.value) || 0;
                    if (vFactor && vPrice) {
                        const factor = parseFloat(vFactor.value) || 0;
                        if (factor > 0) {
                            vPrice.value = (base * factor);
                        }
                    }
                    updateMargin();
                };

                bPrice.addEventListener('input', calc);
                if (vFactor) vFactor.addEventListener('input', calc);
                updateMargin();
            },
            preConfirm: () => {
                const basePriceInput = parseFloat(document.getElementById('v-base-price').value);
                const nameInput = document.getElementById('v-name');
                const skuInput = document.getElementById('v-sku');
                const factorInput = document.getElementById('v-factor');
                const priceInput = document.getElementById('v-price');

                const name = nameInput ? nameInput.value : '';
                const sku = skuInput ? skuInput.value : '';
                const factorValue = factorInput ? factorInput.value : '';
                const priceValue = priceInput ? priceInput.value : '';

                if (isNaN(basePriceInput) || basePriceInput <= 0) {
                    Swal.showValidationMessage('El precio de unidad base debe ser mayor a 0');
                    return false;
                }

                // If user filled ANY variant field, they must fill all required ones
                const vFilled = name || factorValue || priceValue;
                if (vFilled) {
                    if (!name || !factorValue || !priceValue) {
                        Swal.showValidationMessage('Para añadir una variante, complete Nombre, Factor y Precio.');
                        return false;
                    }
                }

                return {
                    basePrice: basePriceInput,
                    variant: vFilled ? {
                        name,
                        sku,
                        factor: parseInt(factorValue),
                        price: parseFloat(priceValue)
                    } : null
                };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { basePrice: newBase, variant } = result.value;

                // 1. Update Base Price in Products Table
                const { error: pError } = await supabase
                    .from('products')
                    .update({ price: newBase })
                    .eq('id', productId);

                if (pError) {
                    Swal.fire('Error', 'No se pudo actualizar el precio base: ' + pError.message, 'error');
                    return;
                }

                // 2. Insert Variant if present
                if (variant) {
                    const { error: vError } = await supabase.from('product_variants').insert({
                        product_id: productId,
                        name: variant.name,
                        sku: variant.sku,
                        conversion_factor: variant.factor,
                        price: variant.price
                    });

                    if (vError) {
                        Swal.fire('Error', 'No se pudo guardar la variante: ' + vError.message, 'error');
                        return;
                    }
                }

                // Feedback and refresh background
                await this.updateProductRow(productId);

                // Re-open manager for continuous editing (Same Mode)
                this.manageVariants(productId, productName, mode);
            }
        });
    }


    async deleteVariant(variantId, productId, productName) {
        const res = await Swal.fire({
            title: '¿Eliminar variante?',
            text: "Esta acción no se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });

        if (res.isConfirmed) {
            const { error } = await supabase.from('product_variants').delete().eq('id', variantId);
            if (error) {
                Swal.fire('Error', error.message, 'error');
            } else {
                await this.updateProductRow(productId);
                this.manageVariants(productId, productName, 'full');
            }
        }
    }

    /**
     * PRODUCT IMAGE MANAGEMENT
     * Mirrored from WarehouseView for consistency
     */
    async openUpdateImageModal(productId) {
        const item = this.catalogTable.data.find(i => String(i.id) === productId);
        if (!item) return;

        const currentImg = item.image_url || 'https://via.placeholder.com/150?text=No+Img';

        const { value: file } = await Swal.fire({
            title: 'Actualizar Imagen',
            html: `
                <div style="margin-bottom:1rem; text-align: center;">
                    <p style="color:#64748b; font-size:0.9rem; margin:0 0 1rem 0;">${item.name}</p>
                    <img id="update-img-preview" src="${currentImg}" 
                         style="width:120px; height:120px; object-fit:cover; border-radius:12px; background:#f1f5f9; border:1px solid #cbd5e1; margin:0 auto; display:block;">
                </div>
                <div style="margin-top:1rem;">
                    <input type="file" id="update-img-input" accept="image/*" style="display:none;" 
                           onchange="window.managerView.handleImagePreview(this)">
                    <label for="update-img-input" style="display:flex; align-items:center; justify-content:center; gap:0.5rem; padding:0.8rem; background:white; border:1px dashed #cbd5e1; border-radius:12px; cursor:pointer; transition:all 0.2s ease;">
                        <i class="fas fa-camera" style="color:#64748b;"></i>
                        <span style="color:#334155; font-weight:600;">Seleccionar Nueva Foto</span>
                    </label>
                    <div id="update-filename" style="font-size:0.75rem; color:#94a3b8; margin-top:0.5rem; min-height:1.2em; text-align:center;"></div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Guardar Imagen',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#10b981',
            preConfirm: () => {
                const input = document.getElementById('update-img-input');
                if (!input.files || !input.files[0]) {
                    Swal.showValidationMessage('Selecciona una imagen nueva');
                    return false;
                }
                if (input.files[0].size > 2 * 1024 * 1024) {
                    Swal.showValidationMessage('La imagen no debe superar 2MB');
                    return false;
                }
                return input.files[0];
            }
        });

        if (file) {
            this.updateProductImageProcess(productId, file);
        }
    }

    handleImagePreview(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('update-img-preview');
                if (preview) preview.src = e.target.result;
                const nameDisplay = document.getElementById('update-filename');
                if (nameDisplay) {
                    nameDisplay.innerHTML = `${file.name} (${Math.round(file.size / 1024)} KB) ✅`;
                }
            }
            reader.readAsDataURL(file);
        }
    }

    async updateProductImageProcess(productId, file) {
        try {
            Swal.showLoading();
            const fileExt = file.name.split('.').pop();
            const fileName = `prod_${productId}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            const { error: dbError } = await supabase.from('products')
                .update({ image_url: publicUrl })
                .eq('id', productId);

            if (dbError) throw dbError;

            Swal.fire({
                icon: 'success',
                title: 'Imagen Actualizada',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });

            await this.updateProductRow(productId);
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'No se pudo actualizar la imagen', 'error');
        }
    }

    // ==========================================
    // HISTORY SECTION
    // ==========================================

    async renderHistory(container) {
        if (!container) return;
        container.innerHTML = `<div id="history-table-wrapper" style="height: calc(100vh - 200px);"></div>`;

        this.historyTable = new AdvancedTable({
            container: document.getElementById('history-table-wrapper'),
            id: 'managerHistoryTable',
            title: 'Historial de Ventas',
            columns: [
                { key: 'created_at', label: 'Fecha y Hora', sortable: true, format: 'datetime' },
                { key: 'id', label: 'ID Transacción', formatter: (val) => `<code style="font-family: monospace; color: #6366f1;">#${val.substring(0, 8)}</code>` },
                { key: 'user_name', label: 'Vendedor', formatter: (val, row) => row.profiles?.full_name || 'Sistema' },
                { key: 'store_id', label: 'Sede', formatter: (val) => `Sede #${val?.substring(0, 8) || 'Global'}` },
                {
                    key: 'status',
                    label: 'Estado',
                    format: 'badge',
                    badgeMap: { 'completed': 'badge-success', 'voided': 'badge-error' },
                    labelMap: { 'completed': 'Completada', 'voided': 'Anulada' }
                },
                { key: 'total_amount', label: 'Monto Total', sortable: true, format: 'currency', align: 'right' }
            ],
            filters: [
                { key: 'search', label: 'ID Transacción', type: 'text' },
                {
                    key: 'scope',
                    label: 'Alcance',
                    type: 'select',
                    options: [
                        { value: 'all', label: 'Toda la tienda' },
                        { value: 'personal', label: 'Mis ventas solamente' }
                    ]
                },
                { key: 'status', label: 'Estado', type: 'select', options: [{ value: 'completed', label: 'Completada' }, { value: 'voided', label: 'Anulada' }] }
            ],
            summaryFields: [
                { key: 'total_count', label: 'Transacciones' },
                { key: 'total_amount_sum', label: 'Total Facturado', format: 'currency', prefix: '$', highlight: true, decimals: 2 }
            ],
            fetchData: async (filters, sort) => {
                let query = supabase.from('transactions').select('*, profiles:seller_id(full_name)', { count: 'exact' });

                if (filters.search) query = query.ilike('id', `%${filters.search}%`);
                if (filters.status) query = query.eq('status', filters.status);
                if (filters.scope === 'personal') query = query.eq('seller_id', this.profile.id);
                else if (!this.isGlobalAdmin) query = query.eq('store_id', this.storeId);

                const { data, count, error } = await query.order(sort.column || 'created_at', { ascending: sort.direction === 'asc' });

                console.log("Historial Manager - Ventas recuperadas:", data);

                if (error) {
                    console.error("Error recuperando historial:", error);
                    throw error;
                }

                const totalSum = (data || []).reduce((acc, curr) => acc + (curr.status === 'completed' ? parseFloat(curr.total_amount || 0) : 0), 0);
                return (data || []).map(d => ({ ...d, total_count: count, total_amount_sum: totalSum }));
            },
            onRowClick: (row) => this.showTransactionDrawer(row.id),
            mobileCardRenderer: (row, idx) => {
                const date = new Date(row.created_at).toLocaleDateString();
                const time = new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const total = this.formatCurrency(row.total_amount || 0);
                const isCompleted = row.status === 'completed';
                const statusClass = isCompleted ? 'success' : 'error';
                const statusLabel = isCompleted ? 'Completada' : 'Anulada';

                return `
                    <div class="adv-mobile-card" onclick="window['managerHistoryTable'].handleRowClick(${idx})" style="padding: 16px; border-left: 4px solid ${isCompleted ? '#10b981' : '#ef4444'};">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <div style="font-size: 1.5rem; background: #f8fafc; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">receipt</div>
                                <div>
                                    <div class="card-name" style="font-weight: 800; color: #1e293b;">Venta #${row.id.substring(0, 8)}</div>
                                    <div class="card-meta" style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">${date} • ${time} • Sede #${row.store_id?.substring(0, 4) || 'GLB'}</div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 1.1rem; font-weight: 900; color: #1e293b;">${total}</div>
                                <span style="font-size: 0.65rem; font-weight: 800; color: ${isCompleted ? '#10b981' : '#ef4444'}; text-transform: uppercase; letter-spacing: 0.5px;">${statusLabel}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        await this.historyTable.render();
    }

    /**
     * Helpers
     */
    showMainLoader() {
        this.container.innerHTML = `
      <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8fafc;">
        <div class="spinner" style="width: 50px; height: 50px; border-width: 5px;"></div>
        <p style="margin-top: 20px; color: #64748b; font-weight: 500;">Iniciando Panel Gerencial...</p>
      </div>
    `;
    }

    addNewProduct() {
        Swal.fire({
            title: 'Nuevo Producto',
            text: 'La creación de productos se gestiona desde el panel de Bodega o a través de la API masiva.',
            icon: 'info',
            confirmButtonText: 'Entendido'
        });
    }

    /**
     * TRANSACTION AUDIT & VOID LOGIC
     */

    async showTransactionDrawer(transactionId) {
        const drawer = document.getElementById('transaction-drawer');
        const overlay = document.getElementById('drawer-overlay');

        drawer.innerHTML = `
        <div style="padding: 30px; text-align: center;">
          <div class="spinner"></div>
          <p>Cargando detalles...</p>
        </div>
        `;

        drawer.classList.add('open');
        overlay.classList.add('open');

        try {
            // Fetch transaction with items and profiles
            const { data: trans, error } = await supabase
                .from('transactions')
                .select(`
        *,
        profiles:seller_id(full_name),
        transaction_items(
        *,
        products(name, sku, image_url),
        product_variants(name, sku)
        )
        `)
                .eq('id', transactionId)
                .single();

            if (error) throw error;

            const isVoided = trans.status === 'voided';

            drawer.innerHTML = `
        <div style="padding: 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h2 style="margin: 0; font-size: 1.25rem; color: #1e293b;">Ticket #${trans.id.substring(0, 8)}</h2>
            <div style="margin-top: 4px;">
              <span class="badge ${isVoided ? 'badge-voided' : 'badge-completed'}">${isVoided ? 'Anulada' : 'Completada'}</span>
            </div>
          </div>
          <button onclick="window.managerView.closeDrawer()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #94a3b8;">&times;</button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 24px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; font-size: 0.9rem;">
            <div>
              <label style="display: block; color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Fecha </label>
              <div style="font-weight: 500;">${new Date(trans.created_at).toLocaleDateString()}</div>
              <div style="color: #94a3b8;">${new Date(trans.created_at).toLocaleTimeString()}</div>
            </div>
            <div>
              <label style="display: block; color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Vendedor</label>
              <div style="font-weight: 500;">${trans.profiles?.full_name || 'Desconocido'}</div>
            </div>
          </div>

          <h4 style="font-size: 0.85rem; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px;">Productos</h4>
          <div class="items-list">
            ${trans.transaction_items.map(item => `
               <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed #f1f5f9; font-size: 0.9rem;">
                 <div style="flex: 1;">
                   <div style="font-weight: 600;">${item.products?.name}</div>
                   ${item.product_variants ? `<div style="font-size: 0.8em; color: #6366f1;">${item.product_variants.name}</div>` : ''}
                   <div style="font-size: 0.8em; color: #94a3b8;">SKU: ${item.product_variants?.sku || item.products?.sku || 'N/A'}</div>
                 </div>
                 <div style="text-align: right; min-width: 100px;">
                   <div>${item.quantity} x ${new Intl.NumberFormat('es-CO').format(item.price_at_sale)}</div>
                   <div style="font-weight: 700;">${new Intl.NumberFormat('es-CO').format(item.quantity * item.price_at_sale)}</div>
                 </div>
               </div>
             `).join('')}
          </div>

          <div style="margin-top: 24px; background: #f8fafc; padding: 16px; border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #64748b;">
              <span>Subtotal</span>
              <span>${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(trans.total_amount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1.2rem; color: #1e293b; border-top: 2px solid white; padding-top: 8px;">
              <span>TOTAL</span>
              <span>${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(trans.total_amount)}</span>
            </div>
          </div>

          ${isVoided ? `
             <div style="margin-top: 24px; padding: 16px; background: #fff1f2; border: 1px solid #fecaca; border-radius: 12px; font-size: 0.85rem; color: #991b1b;">
               <div style="font-weight: 700; margin-bottom: 4px;">Información de Anulación</div>
               <div>Motivo: ${trans.void_reason || 'No especificado'}</div>
               <div>Anulada el: ${trans.cancelled_at ? new Date(trans.cancelled_at).toLocaleString() : 'N/A'}</div>
             </div>
           ` : ''}
        </div>

        <div style="padding: 24px; border-top: 1px solid #f1f5f9;">
          ${!isVoided && (this.profile.role === 'manager' || this.profile.role === 'admin' || !this.storeId) ? `
             <button onclick='window.managerView.promptVoidTransaction(${JSON.stringify(trans).replace(/'/g, "&apos;")})' 
                     style="width: 100%; padding: 12px; background: #dc2626; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
               <i class="fas fa-ban"></i> ANULAR TRANSACCIÓN
             </button>
           ` : `
             <button disabled style="width: 100%; padding: 12px; background: #f3f4f6; color: #94a3b8; border: none; border-radius: 8px; font-weight: 600; cursor: not-allowed;">
               ${isVoided ? 'TRANSACCIÓN ANULADA' : 'SIN PERMISOS PARA ANULAR'}
             </button>
           `}
        </div>
        `;
        } catch (error) {
            drawer.innerHTML = `<div style="padding: 30px; color: #ef4444;">Error al cargar: ${error.message}</div>`;
        }
    }

    closeDrawer() {
        document.getElementById('transaction-drawer').classList.remove('open');
        document.getElementById('drawer-overlay').classList.remove('open');
    }

    async promptVoidTransaction(trans) {
        const { value: reason } = await Swal.fire({
            title: '¿Anular esta transacción?',
            text: 'Esta acción revertirá el stock y marcará la venta como inválida. Es irreversible.',
            icon: 'warning',
            input: 'text',
            inputLabel: 'Motivo de la anulación (obligatorio)',
            inputPlaceholder: 'Ej: Error en medios de pago, cliente desistió...',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, anular venta',
            cancelButtonText: 'Cancelar',
            inputValidator: (value) => {
                if (!value) return '¡Debes ingresar un motivo!';
            }
        });

        if (reason) {
            this.executeVoidTransaction(trans.id, reason);
        }
    }

    async executeVoidTransaction(transactionId, reason) {
        Swal.fire({
            title: 'Procesando...',
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            // Verificamos rol nuevamente en backend vía RPC
            const { data, error } = await supabase.rpc('void_transaction', {
                p_transaction_id: transactionId,
                p_reason: reason,
                p_user_id: this.profile.id
            });

            if (error) throw error;

            if (data.success) {
                await Swal.fire('¡Operación Exitosa!', 'La transacción ha sido anulada y el inventario actualizado.', 'success');
                this.closeDrawer();
                this.refreshCurrentView();
                if (this.activeTab === 'history') await this.renderHistory(document.getElementById('manager-content'));
            } else {
                throw new Error(data.message || 'Error desconocido');
            }
        } catch (error) {
            console.error('Void Error:', error);
            Swal.fire('Error de Anulación', error.message, 'error');
        }
    }

    // ==========================================
    // INVENTORY & PROFITABILITY REPORT
    // ==========================================

    async renderInventoryReport(container) {
        if (!container) return;

        container.innerHTML = `
        <div class="report-section">
          <div id="inventory-report-table-wrapper" style="flex: 1; min-height: 0;"></div>
        </div>
        `;

        this.inventoryReportTable = new AdvancedTable({
            container: document.getElementById('inventory-report-table-wrapper'),
            id: 'inventoryReportTable',
            title: 'Análisis de Inventario & Rentabilidad',
            columns: [
                {
                    key: 'product_name',
                    label: 'Producto / SKU',
                    sortable: true,
                    formatter: (val, row) => `
                        <div style="font-weight: 700; color: #1e293b;">${val}</div>
                        <div style="font-size: 0.75rem; color: #64748b; font-family: monospace;">${row.sku || '-'}</div>
                    `
                },
                {
                    key: 'current_stock',
                    label: 'Stock Actual',
                    sortable: true,
                    align: 'center',
                    formatter: (val) => `<span style="font-weight: 700; color: ${val < 10 ? '#ef4444' : '#1e293b'}">${val}</span>`
                },
                { key: 'total_inputs', label: 'Entradas', sortable: true, align: 'center' },
                { key: 'total_outputs', label: 'Salidas', sortable: true, align: 'center' },
                { key: 'sale_price', label: 'P. Venta', format: 'currency', align: 'right' },
                {
                    key: 'total_sale_amount',
                    label: 'Importe Venta',
                    sortable: true,
                    format: 'currency',
                    align: 'right',
                    formatter: (val) => `<span style="font-weight: 700; color: #1e293b;">${this.formatCurrency(val)}</span>`
                },
                {
                    key: 'profit',
                    label: 'Utilidad',
                    sortable: true,
                    format: 'currency',
                    align: 'right',
                    formatter: (val) => `<span style="font-weight: 700; color: ${val >= 0 ? '#10b981' : '#ef4444'}">${this.formatCurrency(val)}</span>`
                }
            ],
            filters: [
                { key: 'search', label: 'Buscar Producto', type: 'text' },
                { key: 'dateFrom', label: 'Desde', type: 'date' },
                { key: 'dateTo', label: 'Hasta', type: 'date' }
            ],
            fetchData: async (filters, sort) => {
                const { data, error } = await supabase.rpc('get_inventory_report', {
                    p_store_id: this.storeId,
                    p_from_date: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
                    p_to_date: filters.dateTo ? new Date(filters.dateTo).toISOString() : null
                });

                if (error) throw error;

                // Apply client-side search if needed
                let filtered = data || [];
                if (filters.search) {
                    const s = filters.search.toLowerCase();
                    filtered = filtered.filter(r =>
                        r.product_name.toLowerCase().includes(s) ||
                        (r.sku && r.sku.toLowerCase().includes(s))
                    );
                }

                // Update Report KPIs
                const totals = filtered.reduce((acc, curr) => {
                    acc.sales += parseFloat(curr.total_sale_amount || 0);
                    acc.cost += parseFloat(curr.total_cost_amount || 0);
                    acc.profit += parseFloat(curr.profit || 0);
                    return acc;
                }, { sales: 0, cost: 0, profit: 0 });

                this.updateReportKPIs(totals);

                return filtered;
            },
            mobileCardRenderer: (row, idx) => {
                const profit = Number(row.profit || 0);
                const salePrice = Number(row.sale_price || 0);
                const costPrice = Number(row.cost_price || 0);
                const status = profit >= 0 ? 'green' : 'red';

                return `
                    <div class="adv-mobile-card" style="padding: 16px; gap: 12px; flex-direction: column; align-items: stretch;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <div style="font-size: 1.8rem; background: #f8fafc; padding: 10px; border-radius: 12px;">📊</div>
                                <div>
                                    <div class="card-name" style="font-weight: 800; font-size: 1.05rem; color: #1e293b;">${row.product_name}</div>
                                    <div class="card-meta" style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">
                                        Stock: <span style="color:#1e293b">${row.current_stock}</span> • 
                                        Vendidos: <span style="color:#6366f1">${row.total_outputs}</span>
                                    </div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 0.7rem; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.5px;">Utilidad Total</div>
                                <div style="font-size: 1.1rem; font-weight: 900; color: ${profit >= 0 ? '#10b981' : '#ef4444'}">${this.formatCurrency(profit)}</div>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #f1f5f9;">
                            <div>
                                <div style="font-size: 0.65rem; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Potencial Unitario</div>
                                <div style="font-size: 0.9rem; font-weight: 700; color: #1e293b;">
                                    ${this.formatCurrency(salePrice)} <span style="color: #cbd5e1; font-weight: 400; font-size: 0.8rem;">/ ${this.formatCurrency(costPrice)}</span>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 0.65rem; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Venta Realizada (${row.total_outputs})</div>
                                <div style="font-size: 0.9rem; font-weight: 700; color: #6366f1;">${this.formatCurrency(row.total_sale_amount)}</div>
                            </div>
                        </div>

                        <div style="height: 4px; background: #f1f5f9; border-radius: 2px; overflow: hidden; margin-top: 4px;">
                            <div style="height: 100%; width: ${Math.min(100, (row.total_outputs / (row.current_stock + row.total_outputs) * 100) || 0)}%; background: #6366f1;"></div>
                        </div>
                    </div>
                `;
            }
        });

        await this.inventoryReportTable.render();
    }

    /**
     * INVENTORY AUDIT (KARDEX) METHODS
     */
    async showProductLedger(productId, productName, productSku) {
        // En esta vista usamos el mismo drawer que para las transacciones
        const drawer = document.getElementById('transaction-drawer');
        const overlay = document.getElementById('drawer-overlay');

        drawer.innerHTML = `
            <div style="padding: 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: flex-start; background: white;">
                <div>
                    <div style="font-size: 0.7rem; font-weight: 800; color: var(--loy-primary); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px;">Kárdex de Inventario</div>
                    <h2 style="margin: 0; font-size: 1.3rem; color: #1e293b; font-weight: 800;">${productName}</h2>
                    <div style="display: flex; gap: 8px; margin-top: 8px; align-items:center;">
                        <span class="sku-badge" style="background: #f1f5f9; color: #64748b; font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; font-weight: 700; border: 1px solid #e2e8f0;">SKU: ${productSku}</span>
                        <div style="width: 4px; height: 4px; background: #cbd5e1; border-radius: 50%;"></div>
                        <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">Historial de movimientos</span>
                    </div>
                </div>
                <button onclick="window.managerView.closeDrawer()" style="background: #f8fafc; border: 1px solid #e2e8f0; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #94a3b8; transition: all 0.2s;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="flex: 1; overflow-y: auto; padding: 0;" id="kardex-content">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: #94a3b8;">
                    <div class="swal2-loader" style="display: block; margin-bottom: 20px;"></div>
                    <p style="font-weight: 600; font-size: 0.9rem;">Consultando registros contables...</p>
                </div>
            </div>
        `;

        drawer.classList.add('open');
        overlay.classList.add('open');

        try {
            const { data, error } = await supabase.rpc('get_product_stock_ledger', {
                p_product_id: productId,
                p_store_id: this.storeId
            });

            if (error) throw error;

            const content = document.getElementById('kardex-content');
            if (!data || data.length === 0) {
                content.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 400px; text-align: center; padding: 40px;">
                        <div style="width: 80px; height: 80px; background: #f8fafc; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                            <i class="fas fa-box-open" style="font-size: 2.5rem; color: #cbd5e1;"></i>
                        </div>
                        <h3 style="margin: 0; color: #1e293b; font-weight: 700;">Sin Movimientos</h3>
                        <p style="color: #64748b; max-width: 250px; margin-top: 8px; font-size: 0.9rem;">No se encontraron entradas ni salidas registradas para este producto.</p>
                    </div>
                `;
                return;
            }

            content.innerHTML = `
                <div style="padding: 15px;">
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem;">
                        <thead style="position: sticky; top: 0; background: white; z-index: 10;">
                            <tr>
                                <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #f1f5f9; color: #64748b; font-weight: 700; width: 30%;">FECHA</th>
                                <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #f1f5f9; color: #64748b; font-weight: 700;">CONCEPTO</th>
                                <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #f1f5f9; color: #64748b; font-weight: 700;">CANT.</th>
                                <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #f1f5f9; color: #64748b; font-weight: 700;">SALDO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.slice().reverse().map(m => {
                const date = new Date(m.created_at);
                const isEntry = (m.entry > 0);
                const qtyColor = isEntry ? '#10b981' : '#f43f5e';
                const qtySign = isEntry ? '+' : '-';
                const qtyValue = isEntry ? m.entry : m.exit;

                return `
                                    <tr style="transition: background 0.2s; cursor: default;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                                        <td style="padding: 14px 8px; border-bottom: 1px solid #f1f5f9;">
                                            <div style="font-weight: 700; color: #334155;">${date.toLocaleDateString([], { day: '2-digit', month: 'short' })}</div>
                                            <div style="font-size: 0.75rem; color: #94a3b8;">${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td style="padding: 14px 8px; border-bottom: 1px solid #f1f5f9;">
                                            <div style="display: flex; align-items: center; gap: 6px;">
                                                <div style="width: 6px; height: 6px; border-radius: 50%; background: ${this.getMovementColor(m.movement_type)}"></div>
                                                <span style="font-weight: 800; font-size: 0.72rem; color: #475569; letter-spacing: 0.02em;">${this.getMovementLabel(m.movement_type)}</span>
                                            </div>
                                            <div style="font-size: 0.7rem; color: #cbd5e1; font-family: monospace; margin-top: 2px; margin-left: 12px;">Ref: ${m.reference_id === 'N/A' || !m.reference_id ? 'S/N' : m.reference_id.substring(0, 8)}</div>
                                        </td>
                                        <td style="padding: 14px 8px; border-bottom: 1px solid #f1f5f9; text-align: right;">
                                            <div style="color: ${qtyColor}; font-weight: 800; font-size: 0.95rem;">${qtySign}${qtyValue}</div>
                                        </td>
                                        <td style="padding: 14px 8px; border-bottom: 1px solid #f1f5f9; text-align: right;">
                                            <div style="background: #f1f5f9; display: inline-block; padding: 2px 8px; border-radius: 6px; color: #1e293b; font-weight: 900; font-size: 0.9rem;">${m.running_balance}</div>
                                        </td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (err) {
            document.getElementById('kardex-content').innerHTML = `
                <div style="padding: 40px; text-align: center; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p style="font-weight: 700;">Error al cargar datos</p>
                    <p style="font-size: 0.8rem; margin-top: 5px;">${err.message}</p>
                </div>
            `;
        }
    }


    getMovementLabel(type) {
        const map = {
            'sale': 'VENTA', 'OUT_SALE': 'VENTA',
            'initial': 'INICIAL',
            'adjustment': 'AJUSTE', 'ADJ_IN': 'AJUSTE (+)', 'ADJ_OUT': 'AJUSTE (-)',
            'purchase': 'COMPRA', 'IN_RECEIPT': 'COMPRA',
            'return': 'DEVOLUC.',
            'transfer': 'TRANSF.',
            'VOID_RECEIPT': 'ANULAC. COMPRA'
        };
        return map[type] || type.toUpperCase();
    }

    getMovementColor(type) {
        const map = {
            'sale': '#f43f5e', 'OUT_SALE': '#f43f5e',
            'initial': '#6366f1',
            'purchase': '#10b981', 'IN_RECEIPT': '#10b981',
            'adjustment': '#f59e0b', 'ADJ_IN': '#f59e0b', 'ADJ_OUT': '#f59e0b'
        };
        return map[type] || '#64748b';
    }



    formatCurrency(val) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val || 0);
    }

    updateReportKPIs(totals) {
        const s = document.getElementById('report-kpi-sales');
        const c = document.getElementById('report-kpi-cost');
        const p = document.getElementById('report-kpi-profit');
        const pc = document.getElementById('kpi-profit-card');

        if (s) s.textContent = this.formatCurrency(totals.sales);
        if (c) c.textContent = this.formatCurrency(totals.cost);
        if (p) {
            p.textContent = this.formatCurrency(totals.profit);
            if (pc) pc.classList.toggle('negative', totals.profit < 0);
        }
    }

    async updateProductRow(productId) {
        if (!this.catalogTable) return;
        // Por ahora refrescamos la tabla completa para asegurar consistencia de stock y variantes
        await this.catalogTable.refresh();
    }

    injectCSS() {
        if (document.getElementById('manager-view-styles')) return;
        const style = document.createElement('style');
        style.id = 'manager-view-styles';
        style.innerHTML = `
            :root {
                --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;
                --clr-primary: #6366f1; --clr-primary-dark: #4f46e5;
                --clr-bg: #f8fafc; --clr-surface: #ffffff;
                --clr-border: #e2e8f0; --clr-text: #1e293b; --clr-text-muted: #64748b;
                --clr-success: #10b981; --clr-success-dark: #059669;
                --clr-error: #ef4444; --clr-info: #3b82f6;
            }

            .manager-enterprise-layout {
                display: flex; flex-direction: column; height: 100vh; background: var(--clr-bg); overflow: hidden;
            }

            .manager-enterprise-content { flex: 1; overflow-y: auto; padding: var(--sp-6); }

            /* POS/Manager Side Menu Drawer */
            .pos-side-menu {
                position: fixed;
                top: 0; left: 0; bottom: 0;
                width: 280px;
                background: white;
                z-index: 1050;
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
                cursor: pointer;
            }
            
            .menu-item:hover {
                background: #f8fafc;
                color: #1e293b;
            }
            
            .menu-item.active {
                background: var(--clr-primary, #2563eb);
                color: white;
                font-weight: 700;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
            }

            .menu-item.active i {
                color: white;
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

            /* Overlay for Drawers */
            .drawer-overlay {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px);
                z-index: 1040; opacity: 0; pointer-events: none; transition: opacity 0.3s;
            }
            .drawer-overlay.open { opacity: 1; pointer-events: auto; }

            /* KPI Cards */
            .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--sp-6); margin-bottom: var(--sp-8); }
            .kpi-card {
                padding: var(--sp-6); border-radius: 20px; background: var(--clr-surface);
                border: 1px solid var(--clr-border); box-shadow: 0 4px 20px rgba(0,0,0,0.03);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
            }
            .kpi-card:hover { transform: translateY(-5px); box-shadow: 0 12px 30px rgba(0,0,0,0.08); border-color: var(--clr-primary); }
            .kpi-card::after {
                content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--clr-primary); opacity: 0.5;
            }
            .kpi--sales::after { background: var(--clr-info); }
            .kpi--cost::after { background: #94a3b8; }
            .kpi--profit::after { background: var(--clr-success); }
            .kpi--profit.negative::after { background: var(--clr-error); }

            .kpi-label { font-size: 0.75rem; font-weight: 800; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 1px; }
            .kpi-value { font-size: 2rem; font-weight: 900; color: #0f172a; margin: 12px 0; font-family: 'Outfit', sans-serif; }
            .kpi-subtext { font-size: 0.75rem; color: #94a3b8; font-weight: 600; }
            
            .transaction-drawer {
                position: fixed; top: 0; right: -500px; width: 500px; height: 100vh;
                background: var(--clr-surface); z-index: 1100; box-shadow: -15px 0 35px rgba(0,0,0,0.15);
                transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column;
            }
            .transaction-drawer.open { right: 0; }
            @media (max-width: 500px) { .transaction-drawer { width: 100%; right: -100%; } }

            /* Badges */
            .badge { padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
            .badge-completed { background: #dcfce7; color: #166534; }
            .badge-voided { background: #fee2e2; color: #991b1b; }

            .loading-spinner-container { height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            .spinner {
                width: 40px; height: 40px; border: 4px solid #f1f5f9; border-top-color: var(--clr-primary);
                border-radius: 50%; animation: spin 0.8s linear infinite;
            }
            @keyframes spin { to { transform: rotate(360deg); } }

            /* Utilities */
            .flex-between { display: flex; justify-content: space-between; align-items: center; }
            .tabular-nums { font-variant-numeric: tabular-nums; }
            .clickable-row { cursor: pointer; transition: background 0.2s; }
            .clickable-row:hover { background: #f1f5f9 !important; }

            /* MOBILE MENU ACTION BUTTONS (CLONED FROM WAREHOUSE) */
            .menu-action-btn {
                display: flex; align-items: center; gap: 1rem; width: 100%; padding: 1.25rem;
                background: white; border: 1px solid #f1f5f9; border-radius: 16px;
                cursor: pointer; transition: all 0.2s; text-align: left;
            }
            .menu-action-btn:active { background: #f8fafc; transform: scale(0.98); }
            .btn-icon-circle {
                width: 44px; height: 44px; border-radius: 12px; display: flex;
                align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;
            }
            .btn-text-group { display: flex; flex-direction: column; }
            .btn-main-text { font-weight: 800; font-size: 1rem; color: #1e293b; }
            .btn-sub-text { font-size: 0.75rem; color: #64748b; font-weight: 500; }

            .mobile-action-popup { border-radius: 24px 24px 0 0 !important; margin: 0 !important; width: 100% !important; }

            /* Mobile / Response Tweaks */
            @media (max-width: 768px) {
                :root { --sp-6: 16px; --sp-8: 20px; }
                .kpi-grid { grid-template-columns: 1fr; gap: 16px; }
                .kpi-value { font-size: 1.5rem; }
            }
        `;
        document.head.appendChild(style);
    }

    // =====================================================================
    // AUDITORÍA (PHASE 2 MASTER SCRIPT)
    // =====================================================================
    async renderAudit(container) {
        container.innerHTML = `<div id="audit-table-container" style="height: calc(100vh - 150px);"></div>`;

        new AdvancedTable({
            container: document.getElementById('audit-table-container'),
            id: 'auditLogsTable',
            title: 'Registro de Auditoría',
            columns: [
                { key: 'created_at', label: 'Fecha', format: 'datetime', sortable: true },
                { key: 'user_name', label: 'Usuario', formatter: (val, row) => row.profiles?.full_name || row.user_id },
                { key: 'action', label: 'Acción', formatter: (val) => `<span class="badge ${val === 'VOID' ? 'badge-error' : 'badge-default'}">${val}</span>` },
                { key: 'table_name', label: 'Recurso' },
                { key: 'metadata', label: 'Metadata', formatter: (val) => `<code style="font-size:0.7em;">${JSON.stringify(val || {})}</code>` }
            ],
            filters: [
                { key: 'user', label: 'Usuario ID', type: 'text' },
                { key: 'action', label: 'Acción', type: 'select', options: [{ value: 'INSERT', label: 'Creación' }, { value: 'UPDATE', label: 'Edición' }, { value: 'VOID', label: 'Anulación' }] }
            ],
            fetchData: async (filters, sort) => {
                try {
                    // Consulta optimizada: Usamos la relación declarada en la DB
                    // Si falla el join por falta de FK (400), PostgREST devolverá error y el catch irá al fallback
                    const { data, error } = await supabase
                        .from('audit_logs')
                        .select('*, profiles(full_name)')
                        .order('created_at', { ascending: false })
                        .limit(200);

                    if (error) {
                        console.warn('PostgREST Audit Join Error (400?):', error.message);
                        // FALLBACK: Carga simple sin relaciones
                        const { data: fallback, error: fError } = await supabase
                            .from('audit_logs')
                            .select('created_at, user_id, action, table_name, metadata')
                            .order('created_at', { ascending: false })
                            .limit(200);
                        if (fError) throw fError;
                        return fallback;
                    }
                    return data;
                } catch (err) {
                    console.error('Error cargando auditoría:', err);
                    return [];
                }
            }

        }).render();
    }

    // =====================================================================
    // CIERRE DE CAJA (PHASE 2 MASTER SCRIPT)
    // =====================================================================
    async renderClosure(container) {
        // Fetch cashiers for this store
        const { data: cashiers } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('store_id', this.storeId)
            .eq('role', 'clerk');

        container.innerHTML = `
            <div style="padding: 20px;">
                <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 2rem;">
                    <h2 style="margin-top:0;">Cierre de Caja</h2>
                    <p style="color: #64748b;">Seleccione un cajero para realizar el arqueo y cierre de su jornada.</p>
                    
                    <div style="margin-bottom: 1.5rem; max-width: 400px;">
                        <label style="display:block; font-size: 0.8rem; font-weight:700; color:#475569; margin-bottom:8px; text-transform:uppercase;">Seleccionar Cajero para Cierre</label>
                        <select id="closure-cashier-selector" class="swal2-input" style="width:100%; margin:0; border: 1px solid #cbd5e1; border-radius:8px;" onchange="window.managerView.onCashierSelectChange()">
                            <option value="">-- Seleccionar --</option>
                            ${(cashiers || []).map(c => `<option value="${c.id}">${c.full_name}</option>`).join('')}
                        </select>
                    </div>

                    <button id="btn-perform-closure" class="loy-btn-primary" onclick="window.managerView.performClosure()" disabled style="opacity: 0.5;">
                        <i class="fas fa-calculator"></i> Realizar Cierre Ahora
                    </button>
                    <div id="closure-summary" style="margin-top: 1rem; display:none;"></div>
                </div>
                <div id="closure-history-container" style="height: 500px;"></div>
            </div>
        `;

        new AdvancedTable({
            container: document.getElementById('closure-history-container'),
            id: 'cashClosureTable',
            title: 'Historial de Cierres',
            columns: [
                { key: 'created_at', label: 'Fecha', format: 'datetime' },
                { key: 'profiles', label: 'Cajero', formatter: (val) => val?.full_name || 'Autocierre' },
                { key: 'sales_cash_total', label: 'Ventas Efectivo', format: 'currency' },
                { key: 'sales_card_total', label: 'Ventas Tarjeta', format: 'currency' },
                { key: 'declared_total', label: 'Declarado', format: 'currency' },
                { key: 'difference', label: 'Diferencia', format: 'currency', formatter: (val) => `<span style="color:${val < 0 ? 'red' : 'green'}">${val.toFixed(2)}</span>` }

            ],
            fetchData: async () => (await supabase.from('cash_closures').select('*, profiles(full_name)').order('created_at', { ascending: false })).data
        }).render();
    }

    onCashierSelectChange() {
        const sel = document.getElementById('closure-cashier-selector');
        const btn = document.getElementById('btn-perform-closure');
        if (sel.value) {
            btn.disabled = false;
            btn.style.opacity = '1';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }
    }

    async performClosure() {
        const cashierId = document.getElementById('closure-cashier-selector').value;
        if (!cashierId) return;

        try {
            Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });

            // 1. Get last closure date for this specific cashier
            const { data: lastClosure } = await supabase.from('cash_closures')
                .select('created_at')
                .eq('user_id', cashierId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            const lastDate = lastClosure?.created_at || '2000-01-01';

            // 2. Sum sales since then ONLY for this cashier
            const { data: sales, error: salesError } = await supabase.from('sales')
                .select('payment_method, total_amount')
                .eq('cashier_id', cashierId)
                .eq('status', 'completed')
                .gt('created_at', lastDate);

            if (salesError) throw salesError;

            const totals = (sales || []).reduce((acc, sale) => {
                if (sale.payment_method === 'cash') acc.cash += sale.total_amount;
                else acc.card += sale.total_amount;
                return acc;
            }, { cash: 0, card: 0 });

            const systemTotal = totals.cash + totals.card;

            // 3. Arqueo Modal
            const { value: realTotal } = await Swal.fire({
                title: 'Arqueo de Caja',
                html: `
                    <div style="text-align:left; margin-bottom:1.5rem; background:#f8fafc; padding:1rem; border-radius:8px; border:1px solid #e2e8f0;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span style="color:#64748b; font-size:0.9rem;">Ventas Efectivo:</span>
                            <span style="font-weight:700;">$${totals.cash.toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span style="color:#64748b; font-size:0.9rem;">Tarjeta/Otros:</span>
                            <span style="font-weight:700;">$${totals.card.toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed #cbd5e1;">
                            <span style="color:#1e293b; font-weight:800;">Total Sistema:</span>
                            <span style="color:#2563eb; font-weight:800; font-size:1.1rem;">$${systemTotal.toFixed(2)}</span>
                        </div>
                    </div>
                    <div style="text-align:left;">
                        <label style="display:block; font-size:0.75rem; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:8px;">Total Real Declarado (Efectivo + Comprobantes):</label>
                        <input id="swal-closure-total" type="number" step="0.01" class="swal2-input" style="width:100%; margin:0; border-radius:8px;" placeholder="0.00">
                    </div>
                `,
                confirmButtonText: 'Confirmar Cierre',
                confirmButtonColor: '#2563eb',
                showCancelButton: true,
                cancelButtonText: 'Cancelar',
                preConfirm: () => {
                    const val = parseFloat(document.getElementById('swal-closure-total').value);
                    if (isNaN(val)) {
                        Swal.showValidationMessage('Ingrese un monto válido');
                        return false;
                    }
                    return val;
                }
            });

            if (realTotal !== undefined) {
                // 4. Save Closure linked to the cashier (user_id)
                const { error } = await supabase.from('cash_closures').insert({
                    user_id: cashierId,
                    sales_cash_total: totals.cash,
                    sales_card_total: totals.card,
                    system_expected_total: systemTotal,
                    declared_total: realTotal,
                    notes: `Cierre realizado por ${this.profile.full_name}`
                });


                if (error) throw error;

                const diff = realTotal - systemTotal;
                Swal.fire({
                    title: '¡Cierre Exitoso!',
                    html: `Diferencia: <strong style="color:${diff < 0 ? '#ef4444' : '#10b981'};">${diff.toFixed(2)}</strong>`,
                    icon: 'success'
                });

                this.renderClosure(document.getElementById('manager-view-dynamic-container'));
            }

        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Error al realizar cierre: ' + err.message, 'error');
        }
    }

    /**
     * Action Menu (Modern Popover)
     */
    async openMobileMenu(productId) {
        const item = this.catalogTable.data.find(i => String(i.id) === productId);
        if (!item) return;

        const thumb = item.image_url
            ? `<img src="${item.image_url}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #f1f5f9;">`
            : `<div style="width: 44px; height: 44px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid #e2e8f0; font-size: 1.2rem;">${item.name.charAt(0)}</div>`;

        const { value: action } = await Swal.fire({
            title: `<div style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; padding-left: 8px;">
                        <div style="text-align: left;">
                            <div style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 800; letter-spacing: 0.1em;">Opciones de Producto</div>
                            <div style="font-size: 1.1rem; color: #1e293b; font-weight: 900;">${item.name}</div>
                        </div>
                        <div style="flex-shrink: 0; padding-right: 8px;">
                            ${thumb}
                        </div>
                    </div>`,
            html: `
                <div style="display: flex; flex-direction: column; gap: 0.75rem; text-align: left; padding: 0.5rem;">
                    
                    <button class="menu-action-btn" onclick="Swal.close(); window.managerView.showProductLedger('${item.id}', '${item.name.replace(/'/g, "\\'")}', '${item.sku || 'N/A'}')">
                        <div class="btn-icon-circle" style="background: #eef2ff; color: #6366f1;">
                            <i class="fas fa-history"></i>
                        </div>
                        <div class="btn-text-group">
                            <span class="btn-main-text">📊 Kardex / Auditoría</span>
                            <span class="btn-sub-text">Ver historial detallado de movimientos</span>
                        </div>
                    </button>

                    <button class="menu-action-btn" onclick="Swal.close(); window.managerView.manageVariants('${item.id}', '${item.name.replace(/'/g, "\\'")}', 'full')">
                        <div class="btn-icon-circle" style="background: #ecfdf5; color: #10b981;">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <div class="btn-text-group">
                            <span class="btn-main-text">📦 Gestionar Variantes</span>
                            <span class="btn-sub-text">Añadir packs o unidades de medida</span>
                        </div>
                    </button>

                    <button class="menu-action-btn" onclick="Swal.close(); window.managerView.manageVariants('${item.id}', '${item.name.replace(/'/g, "\\'")}', 'price_only')">
                        <div class="btn-icon-circle" style="background: #fff7ed; color: #f59e0b;">
                            <i class="fas fa-tag"></i>
                        </div>
                        <div class="btn-text-group">
                            <span class="btn-main-text">💰 Asignar Precio de Venta</span>
                            <span class="btn-sub-text">Actualizar precio base y márgenes</span>
                        </div>
                    </button>

                    <button class="menu-action-btn" onclick="Swal.close(); window.managerView.openUpdateImageModal('${item.id}')">
                        <div class="btn-icon-circle" style="background: #fdf2f8; color: #db2777;">
                            <i class="fas fa-camera"></i>
                        </div>
                        <div class="btn-text-group">
                            <span class="btn-main-text">📷 Actualizar Imagen</span>
                            <span class="btn-sub-text">Cambiar la foto del producto</span>
                        </div>
                    </button>

                </div>
            `,
            showConfirmButton: false,
            showCancelButton: false, // Hide the default cancel button
            footer: `<button class="loy-btn-secondary" onclick="Swal.close()" style="width: 100%; margin-top: 1rem;">Cerrar</button>`, // Add a custom "Cerrar" button in the footer
            position: 'bottom',
            grow: 'row',
            customClass: {
                popup: 'mobile-action-popup'
            }
        });
    }

    /**
     * ====================================================================
     * CLEANUP / TEARDOWN
     * ====================================================================
     * Limpia listeners, intervalos y recursos cuando se destruye la vista
     * CRÍTICO para evitar memory leaks
     */
    teardown() {
        console.log('[ManagerView] Iniciando teardown - limpieza de recursos');

        // 1. Limpiar intervalos
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('[ManagerView] Cleared refreshInterval');
        }

        // 2. Limpiar canales Realtime
        // El canal 'manager-updates' escucha múltiples tablas
        try {
            if (this.managerChannel) {
                supabase.removeChannel(this.managerChannel);
                this.managerChannel = null;
                console.log('[ManagerView] Removed manager-updates channel');
            }
        } catch (e) {
            console.warn('[ManagerView] Error removing channel:', e);
        }

        // 3. Limpiar instancias de tablas dinámicas
        if (this.historyTable) {
            if (typeof this.historyTable.destroy === 'function') {
                this.historyTable.destroy();
            }
            this.historyTable = null;
        }

        if (this.inventoryReportTable) {
            if (typeof this.inventoryReportTable.destroy === 'function') {
                this.inventoryReportTable.destroy();
            }
            this.inventoryReportTable = null;
        }

        if (this.auditTable) {
            if (typeof this.auditTable.destroy === 'function') {
                this.auditTable.destroy();
            }
            this.auditTable = null;
        }

        // 4. Limpiar event listeners
        const container = document.getElementById('manager-view-dynamic-container');
        if (container) {
            // Remover listeners de eventos si los hay
            const buttons = container.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.replaceWith(btn.cloneNode(true)); // Remover todos los listeners
            });
        }

        // 5. Limpiar referencias DOM
        this.activeTab = null;
        this.isGlobalAdmin = null;
        this.storeId = null;

        console.log('[ManagerView] Teardown completado');
    }

    /**
     * Alias para destroy() si se llama desde otras partes
     */
    destroy() {
        this.teardown();
    }
}