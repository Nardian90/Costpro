/**
 * AdvancedTable - Enterprise-grade reusable table component
 * 
 * Features:
 * - Persistent configuration (columns, sorting, filtering)
 * - Sticky headers with vertical scrolling
 * - Dynamic summary footer for totals
 * - Integrated filtering system (text, select, date)
 * - States: Loading, Empty, Error
 * - Responsive and high-performance
 * 
 * @version 1.1.0
 * @author Lead Frontend Architect
 */
export default class AdvancedTable {
    constructor(config) {
        this.container = config.container;
        this.id = config.id || 'adv-table-' + Math.random().toString(36).substr(2, 9);
        this.title = config.title || '';
        this.columns = config.columns || [];
        this.filtersConfig = config.filters || [];
        this.summaryFields = config.summaryFields || [];
        this.fetchDataFn = config.fetchData;
        this.onRowClick = config.onRowClick || null;
        this.toolbarActions = config.toolbarActions || [];
        this.mobileCardRenderer = config.mobileCardRenderer || null;
        this.emptyMessage = config.emptyMessage || 'No se encontraron registros';

        // Internal State
        this.data = [];
        this.currentFilters = {};
        this.currentSort = config.initialSort || { column: null, direction: 'desc' };
        this.summaryData = {};
        this.isLoading = false;

        // Debounce for filtering
        this.filterTimeout = null;

        // Initialize Styles
        this.injectStyles();

        // Attach to window for global event accessibility
        window[this.id] = this;
    }

    /**
     * Handle mobile menu interaction
     * Shows a SweetAlert prompt to choose between actions
     */
    async handleMobileMenu(idx) {
        const item = this.data[idx];
        if (!item) return;

        const { value: action } = await Swal.fire({
            title: 'Acciones de Producto',
            text: item.products?.name || 'Seleccione una opción',
            showCancelButton: true,
            cancelButtonText: 'Cerrar',
            confirmButtonColor: 'var(--loy-primary, #6366f1)',
            showDenyButton: true,
            denyButtonText: 'Eliminar / Otros', // Reserved space if needed
            showDenyButton: false, // Hidden for now to focus on requested 2
            confirmButtonText: '<i class="fas fa-plus"></i> Agregar Stock',
            denyButtonText: '<i class="fas fa-edit"></i> Editar Producto',
            customClass: {
                confirmButton: 'loy-btn-primary',
                cancelButton: 'loy-btn-secondary'
            },
            // We use a custom approach for two primary actions in SwAl
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; padding: 10px 0;">
                    <button id="swal-btn-stock" class="swal2-confirm swal2-styled" style="background-color: var(--loy-primary, #6366f1); margin: 0; display: block; width: 100%;">
                        <i class="fas fa-plus" style="margin-right: 8px;"></i> Agregar Stock
                    </button>
                    <button id="swal-btn-edit" class="swal2-deny swal2-styled" style="background-color: #64748b; margin: 0; display: block; width: 100%;">
                        <i class="fas fa-edit" style="margin-right: 8px;"></i> Editar Producto
                    </button>
                </div>
            `,
            showConfirmButton: false, // We use custom internal buttons
            showCancelButton: true,
            didOpen: () => {
                const stockBtn = document.getElementById('swal-btn-stock');
                const editBtn = document.getElementById('swal-btn-edit');

                stockBtn.onclick = () => {
                    Swal.close();
                    if (window.warehouseView) window.warehouseView.openAddStockModal(item);
                };

                editBtn.onclick = () => {
                    Swal.close();
                    if (window.warehouseView) window.warehouseView.editProduct(item);
                };
            }
        });
    }

    /**
     * Entry point to render the table shell
     */
    async render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="adv-table-wrapper-outer" id="${this.id}">
                <div class="adv-table-header-toolbar">
                    ${this.title ? `<h2 class="adv-table-title">${this.title}</h2>` : '<div class="adv-toolbar-spacer"></div>'}
                    
                    <!-- Desktop Actions -->
                    <div class="adv-table-toolbar-actions desktop-only">
                        ${(this.toolbarActions || []).map((action, idx) => `
                            <button class="${action.class || 'loy-btn-primary'}" onclick="window['${this.id}'].handleToolbarAction(${idx})">
                                ${action.icon ? `<i class="${action.icon}"></i>` : ''}
                                ${action.label}
                            </button>
                        `).join('')}
                    </div>

                    <!-- Mobile Controls -->
                    <div class="mobile-header-controls">
                        <div class="header-quick-search-wrapper expanded">
                            <div class="search-input-wrapper">
                                <i class="fas fa-search search-icon" aria-hidden="true"></i>
                                <input type="text" id="${this.id}-quick-search" 
                                    placeholder="Buscar en inventario..." 
                                    aria-label="Buscar"
                                    oninput="window['${this.id}'].handleQuickSearch(this.value)">
                            </div>
                            <button class="search-filter-embedded" onclick="window['${this.id}'].toggleMobileFilters()">
                                <i class="fas fa-sliders-h"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Filters Drawer / Bar -->
                <div class="adv-table-filter-overlay" id="${this.id}-filter-overlay" onclick="window['${this.id}'].toggleMobileFilters()"></div>
                <div class="adv-table-filter-bar" id="${this.id}-filters">
                    <div class="mobile-drawer-header">
                        <h3>Búsqueda y Filtros</h3>
                        <button onclick="window['${this.id}'].toggleMobileFilters()">&times;</button>
                    </div>
                    <div class="adv-filters-content">
                        ${this.renderFiltersShell()}
                    </div>
                    <div class="mobile-drawer-footer">
                        <button class="loy-btn-primary full-width" onclick="window['${this.id}'].toggleMobileFilters()">Ver Resultados</button>
                    </div>
                </div>

                <!-- Actions Menu Drawer (Mobile) -->
                <div class="adv-table-menu-overlay" id="${this.id}-menu-overlay" onclick="window['${this.id}'].toggleMobileMenu()"></div>
                <div class="adv-table-mobile-menu" id="${this.id}-mobile-menu">
                    <div class="mobile-drawer-header">
                        <h3>Acciones</h3>
                        <button onclick="window['${this.id}'].toggleMobileMenu()">&times;</button>
                    </div>
                    <div class="mobile-menu-items">
                         ${(this.toolbarActions || []).map((action, idx) => `
                            <button class="mobile-menu-item ${action.primary ? 'mobile-action-primary' : 'mobile-action-secondary'}" 
                                onclick="window['${this.id}'].handleToolbarAction(${idx}); window['${this.id}'].toggleMobileMenu()">
                                ${action.icon ? `<i class="${action.icon}"></i>` : ''}
                                ${action.label}
                            </button>
                        `).join('')}
                        ${this.toolbarActions.length === 0 ? '<p class="text-muted" style="padding:20px; text-align:center">No hay acciones disponibles</p>' : ''}
                    </div>
                </div>

                <div class="adv-table-content-area" id="${this.id}-content-area">
                    <div class="adv-table-loading-overlay">
                        <div class="adv-table-spinner"></div>
                        <p>Actualizando datos...</p>
                    </div>
                    <div class="adv-table-scroll-container">
                        <!-- Desktop Table View -->
                        <table class="adv-table-main desktop-view">
                            <thead id="${this.id}-thead"></thead>
                            <tbody id="${this.id}-tbody"></tbody>
                        </table>

                        <!-- Mobile Card View -->
                        <div class="adv-mobile-list mobile-view" id="${this.id}-mobile-list"></div>
                    </div>
                    <div class="adv-table-footer-summary" id="${this.id}-summary"></div>
                </div>
            </div>
        `;

        this.setupEventListeners();
        this.renderNavAction();
        await this.refresh();
    }

    /**
     * Move the sandwich menu to the top navbar slot
     */
    renderNavAction() {
        if (!this.toolbarActions || this.toolbarActions.length === 0) return; // Do not render if no actions
        const slot = document.getElementById('loy-nav-action-slot');
        if (!slot) return;
        slot.innerHTML = `
            <button class="loy-btn-icon" onclick="window['${this.id}'].toggleMobileMenu()" title="Menú de Acciones">
                <i class="fas fa-bars"></i>
            </button>
        `;
    }





    /**
     * Handle quick search from header
     * Syncs with the 'search' filter if it exists
     */
    handleQuickSearch(val) {
        // Sync with primary search filter if configured
        const searchInputInFilters = document.querySelector(`#${this.id}-filters input[type="text"]`);
        if (searchInputInFilters) {
            searchInputInFilters.value = val;
        }

        // Use the standard filter input handler (includes debounce)
        this.handleFilterInput('search', val);
    }

    renderFiltersShell() {
        if (this.filtersConfig.length === 0) return '';

        return `
            ${this.filtersConfig.map(f => `
                <div class="adv-table-filter-group">
                    <label>${f.label}</label>
                    ${this.renderFilterControl(f)}
                </div>
            `).join('')}
        `;
    }

    renderFilterControl(f) {
        if (f.type === 'select') {
            return `
                <select onchange="window['${this.id}'].updateFilter('${f.key}', this.value)">
                    <option value="">Todos</option>
                    ${(f.options || []).map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
                </select>
            `;
        }
        if (f.type === 'date') {
            return `<input type="date" onchange="window['${this.id}'].updateFilter('${f.key}', this.value)">`;
        }
        return `
            <div class="search-input-wrapper">
                <i class="fas fa-search search-icon" aria-hidden="true"></i>
                <input type="text" 
                    placeholder="${f.placeholder || 'Filtrar...'}" 
                    aria-label="Buscar"
                    oninput="window['${this.id}'].handleFilterInput('${f.key}', this.value)">
            </div>
        `;
    }

    async refresh() {
        if (this.isLoading) return;
        this.setLoading(true);

        try {
            const result = await this.fetchDataFn(this.currentFilters, this.currentSort);

            // Handle different return formats
            if (Array.isArray(result)) {
                this.data = result;
                this.calculateSummary();
            } else if (result && result.data) {
                this.data = result.data;
                this.summaryData = result.summary || {};
            }

            this.renderHeader();
            this.renderBody();
            this.renderSummary();

        } catch (error) {
            console.error('AdvancedTable Refresh Error:', error);
            this.renderError(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    renderHeader() {
        const thead = document.getElementById(`${this.id}-thead`);
        if (!thead) return;
        thead.innerHTML = `
            <tr>
                ${this.columns.map(col => `
                    <th class="text-${col.align || 'left'} ${col.sortable ? 'sortable' : ''}" 
                        onclick="${col.sortable ? `window['${this.id}'].handleSort('${col.key}')` : ''}">
                        <div class="header-cell-content">
                            <span>${col.label}</span>
                            ${col.sortable ? this.getSortIcon(col.key) : ''}
                        </div>
                    </th>
                `).join('')}
            </tr>
        `;
    }

    renderBody() {
        const tbody = document.getElementById(`${this.id}-tbody`);
        const mobileList = document.getElementById(`${this.id}-mobile-list`);

        if (this.data.length === 0) {
            const emptyContent = `
                <div class="adv-table-empty">
                    <i class="fas fa-folder-open"></i>
                    <p>${this.emptyMessage}</p>
                </div>
            `;
            if (tbody) tbody.innerHTML = `<tr><td colspan="${this.columns.length}">${emptyContent}</td></tr>`;
            if (mobileList) mobileList.innerHTML = emptyContent;
            return;
        }

        // 1. Render Desktop Table Rows
        if (tbody) {
            tbody.innerHTML = this.data.map((row, idx) => `
                <tr class="${this.onRowClick ? 'clickable' : ''}" 
                    onclick="${this.onRowClick ? `window['${this.id}'].handleRowClick(${idx})` : ''}">
                    ${this.columns.map(col => `
                        <td class="text-${col.align || 'left'} ${col.format === 'currency' ? 'tabular-nums' : ''}" data-label="${col.label}">
                            ${this.formatValue(row[col.key], col, row)}
                        </td>
                    `).join('')}
                </tr>
            `).join('');
        }

        // 2. Render Mobile Cards (Structured for Redesign v1.0)
        if (mobileList) {
            if (this.mobileCardRenderer) {
                mobileList.innerHTML = this.data.map((row, idx) => this.mobileCardRenderer(row, idx)).join('');
            } else {
                mobileList.innerHTML = this.data.map((row, idx) => {
                    const prod = row.products || {};
                    const qty = Number(row.quantity) || 0;
                    const name = prod.name || 'Sin nombre';
                    const sku = prod.sku || '-';
                    const category = prod.category || prod.supplier || 'General';
                    const unit = prod.unit_of_measure || 'pz';
                    const price = prod.price || 0;

                    let status = 'green';
                    let stateClass = '';
                    if (qty <= 0) { status = 'red'; stateClass = 'card-out-of-stock'; }
                    else if (qty < 10) { status = 'orange'; stateClass = 'card-low-stock'; }

                    const formattedPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(price);
                    const thumbnailContent = prod.image_url ?
                        `<img src="${prod.image_url}" alt="${name}" class="card-img" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='<div class=\\'placeholder-text\\'>${name.charAt(0)}</div>'">` :
                        `<div class="placeholder-text">${name.charAt(0)}</div>`;

                    return `
                <div class="adv-mobile-card ${stateClass}" onclick="window['${this.id}'].handleRowClick(${idx})">
                    <div class="card-thumbnail-wrapper">
                        <div class="status-dot ${status}"></div>
                        <div class="card-thumbnail">
                            ${thumbnailContent}
                        </div>
                    </div>
                    
                    <div class="card-info">
                        <div class="card-name">${name}</div>
                        <div class="card-meta">${sku} • ${category}</div>
                        <div class="card-price">${formattedPrice}</div>
                    </div>

                    <div class="card-actions-mobile">
                        <button class="card-menu-btn" onclick="event.stopPropagation(); window['${this.id}'].handleMobileMenu(${idx})">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>

                    <div class="card-stock-wrapper">
                        <div class="card-quantity">
                            ${qty}
                            <span class="card-unit">${unit}</span>
                        </div>
                    </div>
                </div>
                `;
                }).join('');
            }
        }
    }

    formatValue(val, col, row) {
        let displayVal = val;

        // If a formatter is provided, it ALWAYS processes the value first (or calculates it if val is null)
        if (typeof col.formatter === 'function') {
            displayVal = col.formatter(val, row);
        }

        if (col.format === 'currency') {
            const num = Number(displayVal);
            if (isNaN(num)) return displayVal;
            return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        if (col.format === 'date') {
            return val ? new Date(val).toLocaleDateString() : '-';
        }
        if (col.format === 'datetime') {
            if (!val) return '-';
            const d = new Date(val);
            return `
                <div class="adv-table-datetime">
                    <div class="adv-table-time">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div class="adv-table-date">${d.toLocaleDateString()}</div>
                </div>
            `;
        }
        if (col.format === 'badge') {
            const badgeClass = col.badgeMap ? col.badgeMap[val] : 'badge-default';
            return `<span class="adv-table-badge ${badgeClass}">${col.labelMap ? col.labelMap[val] : (displayVal || val || '-')}</span>`;
        }

        return displayVal !== null && displayVal !== undefined ? displayVal : '-';
    }

    renderSummary() {
        const summaryBar = document.getElementById(`${this.id}-summary`);
        if (this.summaryFields.length === 0) {
            summaryBar.style.display = 'none';
            return;
        }

        summaryBar.style.display = 'flex';
        summaryBar.innerHTML = this.summaryFields.map(f => {
            let label = f.label;
            let val = this.summaryData[f.key] || 0;

            if (f.format === 'currency') {
                val = `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }

            return `
                <div class="summary-item ${f.highlight ? 'highlight' : ''}">
                    <span class="summary-label">${label}</span>
                    <span class="summary-value">${val}</span>
                </div>
            `;
        }).join('');
    }

    calculateSummary() {
        this.summaryData = {};
        this.summaryFields.forEach(f => {
            if (f.type === 'count') {
                this.summaryData[f.key] = this.data.length;
            } else if (f.type === 'sum') {
                this.summaryData[f.key] = this.data.reduce((acc, curr) => acc + (Number(curr[f.key]) || 0), 0);
            }
        });
    }

    handleSort(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        this.refresh();
    }

    getSortIcon(column) {
        if (this.currentSort.column !== column) return '<i class="fas fa-sort sort-icon inactive"></i>';
        return this.currentSort.direction === 'asc'
            ? '<i class="fas fa-sort-up sort-icon active"></i>'
            : '<i class="fas fa-sort-down sort-icon active"></i>';
    }

    updateFilter(key, value) {
        if (value === '') delete this.currentFilters[key];
        else this.currentFilters[key] = value;
        this.refresh();
    }

    handleFilterInput(key, value) {
        clearTimeout(this.filterTimeout);
        this.filterTimeout = setTimeout(() => {
            this.updateFilter(key, value);
        }, 400);
    }

    handleRowClick(idx) {
        if (this.onRowClick) this.onRowClick(this.data[idx]);
    }

    handleToolbarAction(idx) {
        const action = this.toolbarActions[idx];
        if (action && action.onClick) action.onClick();
    }

    setLoading(loading) {
        this.isLoading = loading;
        const container = document.getElementById(this.id);
        if (container) container.classList.toggle('is-loading', loading);
    }

    renderError(msg) {
        const tbody = document.getElementById(`${this.id}-tbody`);
        tbody.innerHTML = `
            <tr>
                <td colspan="${this.columns.length}">
                    <div class="adv-table-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error: ${msg}</p>
                        <button class="loy-btn-secondary" onclick="window['${this.id}'].refresh()">Reintentar</button>
                    </div>
                </td>
            </tr>
        `;
    }

    setupEventListeners() {
        // Any additional global listeners can go here
    }

    toggleMobileFilters() {
        document.getElementById(`${this.id}-filters`).classList.toggle('open');
        document.getElementById(`${this.id}-filter-overlay`).classList.toggle('open');
    }

    toggleMobileMenu() {
        document.getElementById(`${this.id}-mobile-menu`).classList.toggle('open');
        document.getElementById(`${this.id}-menu-overlay`).classList.toggle('open');
    }

    injectStyles() {
        if (document.getElementById('adv-table-styles')) return;

        const style = document.createElement('style');
        style.id = 'adv-table-styles';
        style.innerHTML = `
            /* Base / Desktop Styles */
            .adv-table-wrapper-outer {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                border: 1px solid #f1f5f9;
                font-family: inherit;
                overflow: hidden; /* Ensure content stays within radius */
            }

            .adv-table-header-toolbar {
                padding: 16px 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #f1f5f9;
                flex-wrap: wrap;
                gap: 12px;
            }

            .adv-table-title {
                margin: 0;
                font-size: 1.1rem;
                font-weight: 700;
                color: #1e293b;
            }

            /* Sticky Filter Bar */
            .adv-table-filter-bar {
                padding: 12px 24px;
                background: #f8fafc;
                border-bottom: 1px solid #f1f5f9;
                position: sticky;
                top: 0;
                z-index: 30;
                box-shadow: 0 4px 6px -4px rgba(0,0,0,0.1);
            }

            .adv-filters-content {
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                width: 100%;
                align-items: flex-end;
                overflow-x: hidden; /* Prevent horizontal scroll */
            }

            .mobile-drawer-header, .mobile-drawer-footer { display: none; }

            .adv-table-filter-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex: 0 1 auto; /* Allow natural wrapping without forcing equal widths */
                min-width: 180px;
                max-width: 250px; /* Prevent excessive stretching */
                box-sizing: border-box; /* Include padding/border in width */
            }

            .adv-table-filter-group label {
                font-size: 0.7rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: #94a3b8;
                font-weight: 700;
            }

            .adv-table-filter-group input, 
            .adv-table-filter-group select {
                padding: 10px 12px;
                border: 1px solid #e2e8f0;
                border-radius: 8px; /* Softer radius */
                font-size: 0.9rem;
                outline: none;
                width: 100%;
                box-sizing: border-box; /* Include padding/border in width calculation */
                transition: all 0.2s;
                background: white;
            }

            .adv-table-filter-group input:focus,
            .adv-table-filter-group select:focus {
                border-color: #6366f1;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
            }

            /* Search Input Wrapper Styles */
            .search-input-wrapper {
                position: relative;
                display: flex;
                align-items: center;
                width: 100%;
            }

            .search-input-wrapper input {
                padding-left: 36px !important; /* Espacio para la lupa */
                width: 100%;
                height: 36px;
                border-radius: 6px;
                border: 1px solid #e2e8f0;
                font-size: 14px;
                transition: all 0.2s;
            }

            .search-input-wrapper input:focus {
                border-color: #6366f1;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                outline: none;
            }

            .search-input-wrapper .search-icon {
                position: absolute;
                left: 10px;
                height: 20px;
                width: 20px;
                pointer-events: none;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #94a3b8;
                z-index: 1;
            }

            .adv-table-content-area {
                position: relative;
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .adv-table-scroll-container {
                flex: 1;
                overflow: auto;
                -webkit-overflow-scrolling: touch; /* Smooth scroll on iOS */
            }

            .adv-table-main {
                width: 100%;
                border-collapse: collapse;
                table-layout: auto;
            }

            .adv-table-main thead {
                position: sticky;
                top: 0;
                z-index: 10;
                background: white;
            }

            .adv-table-main th {
                padding: 12px 16px;
                font-size: 0.75rem;
                font-weight: 600;
                color: #64748b;
                text-transform: uppercase;
                border-bottom: 2px solid #f1f5f9;
                white-space: nowrap;
            }

            .adv-table-main th.sortable { cursor: pointer; }
            .adv-table-main th.sortable:hover { background: #f8fafc; }

            .header-cell-content {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .sort-icon { font-size: 0.8rem; }
            .sort-icon.inactive { color: #cbd5e1; }
            .sort-icon.active { color: #6366f1; }

            .adv-table-main td {
                padding: 12px 16px;
                font-size: 0.9rem;
                color: #334155;
                border-bottom: 1px solid #f1f5f9;
                vertical-align: middle;
            }

            .adv-table-main tr.clickable { cursor: pointer; }
            .adv-table-main tr.clickable:hover { background: #f8fafc; }

            .text-left { text-align: left; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }

            .tabular-nums { font-variant-numeric: tabular-nums; }

            .adv-table-badge {
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 0.75rem;
                font-weight: 600;
                display: inline-block;
            }
            .badge-success { background: #dcfce7; color: #166534; }
            .badge-error { background: #fee2e2; color: #991b1b; }
            .badge-default { background: #f1f5f9; color: #475569; }

            .adv-table-datetime {
                display: flex;
                flex-direction: column;
            }
            .adv-table-time { font-weight: 600; color: #1e293b; }
            .adv-table-date { font-size: 0.75rem; color: #94a3b8; }

            .adv-table-loading-overlay {
                position: absolute;
                inset: 0;
                background: rgba(255,255,255,0.8);
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 50;
                backdrop-filter: blur(4px);
            }

            .is-loading .adv-table-loading-overlay { display: flex; }

            .adv-table-spinner {
                width: 32px;
                height: 32px;
                border: 3px solid #f1f5f9;
                border-top-color: #6366f1;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin { to { transform: rotate(360deg); } }

            .adv-table-footer-summary {
                padding: 16px 24px;
                background: #f8fafc;
                border-top: 2px solid #f1f5f9;
                display: flex;
                gap: 32px;
                justify-content: flex-end;
                flex-wrap: wrap;
            }

            .summary-item {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
            }

            .summary-label { font-size: 0.7rem; text-transform: uppercase; color: #94a3b8; font-weight: 700; }
            .summary-value { font-weight: 800; color: #1e293b; font-size: 1.1rem; }
            .summary-item.highlight .summary-value { color: #6366f1; }

            .adv-table-empty, .adv-table-error {
                padding: 60px;
                text-align: center;
                color: #94a3b8;
            }
            .adv-table-empty i, .adv-table-error i {
                font-size: 3rem;
                margin-bottom: 16px;
                opacity: 0.3;
            }

            /* Viewport Toggling */
            .mobile-view { display: none; }
            .desktop-view { display: table; width: 100%; border-collapse: collapse; }

            @media (max-width: 768px) {
                .adv-toolbar-spacer { display: none; }
                .desktop-view { display: none !important; }
                .mobile-view { display: block !important; }

                .adv-table-wrapper-outer {
                    border: none;
                    box-shadow: none;
                    background: transparent;
                }

                .adv-mobile-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 4px; /* Tiny padding for shadow breathing room */
                }

                /* =========================================
                   PRODUCT CARD v1.0 - MOBILE-FIRST 
                   (Architectural Principle: No Table dependency)
                   ========================================= */
                .adv-mobile-card {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    background: white;
                    border-radius: 16px;
                    border: 1px solid #eef2f6;
                    box-shadow: 0 4px 15px -5px rgba(0,0,0,0.06);
                    padding: 12px;
                    margin-bottom: 8px;
                    position: relative;
                    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s;
                    width: 100%;
                    box-sizing: border-box;
                    cursor: pointer;
                    user-select: none;
                }

                .adv-mobile-card:active {
                    transform: scale(0.97);
                    box-shadow: 0 2px 8px -2px rgba(0,0,0,0.1);
                }

                /* Thumbnail Container */
                .card-thumbnail-wrapper {
                    position: relative;
                    width: 64px;
                    height: 64px;
                    flex-shrink: 0;
                }

                .card-thumbnail {
                    width: 100%;
                    height: 100%;
                    border-radius: 12px;
                    object-fit: cover;
                    background: #f1f5f9; /* Neutro fallback */
                    border: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    text-transform: uppercase;
                    font-weight: 800;
                    color: #94a3b8;
                }

                .placeholder-text {
                    font-size: 1.5rem;
                }

                /* Circular Stock Indicator (Status Dot) */
                .status-dot {
                    position: absolute;
                    top: -4px;
                    left: -4px;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    border: 2px solid white;
                    z-index: 10;
                }

                .status-dot.green { background-color: #22c55e; }
                .status-dot.orange { background-color: #f59e0b; animation: pulse-subtle 2s infinite; }
                .status-dot.red { background-color: #ef4444; }

                @keyframes pulse-subtle {
                    0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
                    70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
                }

                /* Content Container (Center) */
                .card-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    overflow: hidden;
                }

                .card-name {
                    font-size: 1rem;
                    font-weight: 700;
                    color: #1e293b;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-bottom: 2px;
                }

                .card-meta {
                    font-size: 0.75rem;
                    color: #64748b;
                    font-weight: 500;
                }

                .card-price {
                    font-size: 0.9rem;
                    color: var(--loy-primary, #6366f1);
                    font-weight: 700;
                    margin-top: 4px;
                }

                /* Metrics Container (Right) */
                .card-stock-wrapper {
                    text-align: right;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    justify-content: center;
                }

                .card-quantity {
                    font-size: 1.4rem;
                    font-weight: 800;
                    color: #1e293b;
                    display: flex;
                    align-items: baseline;
                    gap: 4px;
                }

                .card-unit {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    font-weight: 600;
                }

                /* Visual States & Dark Mode compatibility */
                .card-out-of-stock {
                    background: #f8fafc;
                    opacity: 0.7;
                }

                .card-out-of-stock .card-info * {
                    color: #64748b;
                }

                .card-low-stock {
                    border-left: 4px solid #f59e0b;
                }

                .card-actions-mobile {
                    position: absolute;
                    top: 10px;
                    right: 8px;
                    z-index: 20;
                }

                .card-menu-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: none;
                    background: transparent;
                    color: #94a3b8;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .card-menu-btn:active {
                    background: #f1f5f9;
                    color: #1e293b;
                    transform: scale(0.9);
                }

                [data-theme*="-dark"] .card-menu-btn:active {
                    background: #334155;
                    color: #f1f5f9;
                }

                /* Adjust quantity to give air to top actions */
                .card-stock-wrapper {
                    text-align: right;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    justify-content: flex-end; /* Push to bottom */
                    min-height: 64px;
                }

                .card-quantity {
                    font-size: 1.4rem;
                    font-weight: 800;
                    color: #1e293b;
                    display: flex;
                    align-items: baseline;
                    gap: 4px;
                    margin-top: 16px; /* Offset to avoid floating icons */
                }

                /* DARK MODE SUPPORT */
                [data-theme*="-dark"] .adv-mobile-card {
                    background: #1e293b;
                    border-color: #334155;
                    box-shadow: 0 4px 15px -5px rgba(0,0,0,0.3);
                }

                [data-theme*="-dark"] .card-name { color: #f1f5f9; }
                [data-theme*="-dark"] .card-meta { color: #94a3b8; }
                [data-theme*="-dark"] .card-quantity { color: #f1f5f9; }
                [data-theme*="-dark"] .card-thumbnail { background: #334155; border-color: #475569; }
                [data-theme*="-dark"] .status-dot { border-color: #1e293b; } /* Adapts ring to dark background */
                [data-theme*="-dark"] .card-out-of-stock { background: #0f172a; opacity: 0.6; }
                [data-theme*="-dark"] .card-out-of-stock .card-info * { color: #475569; }
            
                /* Header / Toolbars */
                .adv-table-header-toolbar {
                    padding: 12px 16px;
                    flex-direction: row; 
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    background: white;
                    border-bottom: 1px solid #e2e8f0;
                    position: sticky;
                    top: 0;
                    z-index: 40;
                }

                .adv-table-title { font-size: 1.1rem; }
                .desktop-only { display: none !important; }
                .mobile-header-controls { 
                    display: flex !important; 
                    align-items: center;
                    gap: 8px; 
                    flex: 1;
                    justify-content: flex-end;
                }

                .adv-toolbar-spacer { flex: 1; }

                .mobile-header-controls { 
                    display: flex !important; 
                    align-items: center;
                    gap: 8px; 
                    flex: 1;
                }

                .adv-table-title { display: none !important; }

                .header-quick-search-wrapper.expanded {
                    position: relative;
                    flex: 1;
                    display: flex;
                    align-items: center;
                }

                .header-quick-search-wrapper input {
                    width: 100%;
                    padding: 10px 45px 10px 35px;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    background: #f8fafc;
                    font-size: 0.95rem;
                }

                .search-filter-embedded {
                    position: absolute;
                    right: 8px;
                    background: #6366f1;
                    color: white;
                    border: none;
                    width: 32px; height: 32px;
                    border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
                }

                .adv-toolbar-spacer { display: none; }
                .mobile-hide { display: none !important; }

                .search-icon-inside {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #94a3b8;
                    font-size: 0.9rem;
                    pointer-events: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%; /* Important for centering */
                }

                .header-quick-search-wrapper {
                    position: relative;
                    flex: 1;
                    display: flex;
                    align-items: center;
                }

                .header-quick-search-wrapper .search-input-wrapper input {
                    border-radius: 20px;
                    background: #f8fafc;
                    padding-right: 45px !important; /* Espacio para el filtro embebido */
                }

                .header-quick-search-wrapper .search-input-wrapper input:focus {
                    background: white;
                }

                .icon-btn {
                    background: #f1f5f9;
                    border: none;
                    width: 40px; height: 40px; border-radius: 50%;
                    color: #1e293b; font-size: 1rem;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer;
                    flex-shrink: 0;
                }

                .settings-trigger {
                    background: var(--loy-primary, #6366f1);
                    color: white;
                    box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.3);
                }
                
                /* Keep drawers */
                .adv-table-filter-overlay, .adv-table-menu-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 998; display: none; opacity: 0; transition: opacity 0.3s; }
                .adv-table-filter-overlay.open, .adv-table-menu-overlay.open { display: block; opacity: 1; }
                .adv-table-filter-bar, .adv-table-mobile-menu { position: fixed; background: white; z-index: 999; transition: transform 0.3s; display: flex !important; flex-direction: column; }
                
                .adv-table-filter-bar { 
                    top: 0; left: 0; bottom: 0; width: 320px; /* Increased for better UX */
                    transform: translateX(-100%); padding: 0; 
                    box-shadow: 5px 0 25px rgba(0,0,0,0.2); 
                    display: flex !important; 
                    flex-direction: column;
                    overflow: hidden; /* Prevent any overflow */
                }
                .adv-table-filter-bar.open { transform: translateX(0); }
                
                .adv-filters-content {
                    flex: 1;
                    overflow-x: hidden; /* Prevent horizontal scroll */
                    overflow-y: auto;   /* Allow vertical scroll */
                    display: flex;
                    flex-direction: column;
                    padding: 16px;
                    gap: 12px; /* Space between filter groups */
                }

                .adv-table-mobile-menu { 
                    top: 0; right: 0; bottom: 0; width: 320px; 
                    transform: translateX(100%); 
                    box-shadow: -5px 0 25px rgba(0,0,0,0.2);
                    overflow: hidden;
                }
                .adv-table-mobile-menu.open { transform: translateX(0); }
                
                /* Mobile menu items container */
                .mobile-menu-items {
                    flex: 1;
                    overflow-x: hidden;
                    overflow-y: auto;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                /* Individual menu item buttons */
                .mobile-menu-item {
                    width: 100%;
                    padding: 14px 16px;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    background: white;
                    color: #1e293b;
                    font-size: 0.9rem;
                    font-weight: 600;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    box-sizing: border-box;
                }
                
                .mobile-menu-item:active {
                    transform: scale(0.98);
                }
                
                .mobile-action-primary {
                    background: #6366f1;
                    color: white;
                    border-color: #6366f1;
                }
                
                .mobile-action-secondary {
                    background: white;
                    color: #475569;
                }
                
                .mobile-action-secondary:active {
                    background: #f8fafc;
                }
                
                .mobile-drawer-header { 
                    padding: 16px; 
                    border-bottom: 1px solid #f1f5f9; 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    flex-shrink: 0; 
                }
                .mobile-drawer-header h3 { margin: 0; font-size: 1.1rem; }
                .mobile-drawer-header button {
                    background: transparent;
                    border: none;
                    font-size: 1.5rem;
                    color: #64748b;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                }
                .mobile-drawer-header button:active {
                    background: #f1f5f9;
                }
                .mobile-drawer-footer { 
                    margin-top: auto; 
                    padding: 16px; 
                    border-top: 1px solid #f1f5f9; 
                    flex-shrink: 0; 
                    display: flex;
                }
                
                .adv-table-filter-group { 
                    padding: 0; 
                    border-bottom: none; 
                    width: 100%; 
                    min-width: 0;
                    max-width: 100%;
                    flex: none;
                } 
                .adv-table-filter-group:last-child { border-bottom: none; }
                
                /* Ensure inputs/selects don't overflow in mobile drawer */
                .adv-table-filter-group input,
                .adv-table-filter-group select {
                    width: 100%;
                    max-width: 100%;
                    box-sizing: border-box;
                    min-width: 0;
                }
            }

            .mobile-header-controls { display: none; }
        `;
        document.head.appendChild(style);
    }
}
