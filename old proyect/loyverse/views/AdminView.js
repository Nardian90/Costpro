import { supabase } from '../supabaseClient.js'
import AdvancedTable from '../components/AdvancedTable.js'
import ViewHeader from '../../ui/components/ViewHeader.js'

/**
 * AdminView - Panel de Control Maestro (Enterprise)
 * Gestión centralizada de Sedes, Usuarios y Seguridad.
 */
export default class AdminView {
    constructor(container) {
        this.container = container;
        this.activeTab = 'stores'; // 'stores' | 'users'
        this.stores = []; // Cache para selectores

        // Inyectar CSS específico
        if (!document.getElementById('admin-enterprise-css')) {
            const link = document.createElement('link');
            link.id = 'admin-enterprise-css';
            link.rel = 'stylesheet';
            link.href = 'src/loyverse/css/views/admin.css';
            document.head.appendChild(link);
        }

        // Exponer globalmente para eventos inline
        window.adminView = this;
        this.realtimeChannel = null;
        this.injectAdminCSS();
    }

    injectAdminCSS() {
        const styleId = 'admin-realtime-effects';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes rowUpdateFlash {
                0% { background-color: rgba(79, 70, 229, 0); }
                20% { background-color: rgba(79, 70, 229, 0.1); }
                100% { background-color: rgba(79, 70, 229, 0); }
            }
            .admin-row-updated {
                animation: rowUpdateFlash 2s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
                border-left: 4px solid var(--admin-primary) !important;
            }
        `;
        document.head.appendChild(style);
    }

    async render() {
        // 1. Role Check
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();

        window.loyApp.updateNavTitle('Admin');

        if (profile?.role !== 'admin') {
            this.container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; text-align:center; padding:2rem;">
                  <div style="font-size:4rem; margin-bottom:1rem;">🚫</div>
                  <h2 style="color:var(--admin-text);">Acceso Restringido</h2>
                  <p style="color:var(--admin-text-light);">Se requieren privilegios de Administrador Global para este panel.</p>
                  <button class="btn-ent btn-ent--primary" onclick="window.location.reload()" style="margin-top:1.5rem;">Volver</button>
                </div>
            `;
            return;
        }

        // 2. Base Template
        this.container.innerHTML = `
      <div class="admin-enterprise-layout anim-fade-in">
        
        <header class="admin-header">
          <nav class="admin-nav">
            <button id="nav-stores" class="admin-nav-btn ${this.activeTab === 'stores' ? 'active' : ''}" onclick="window.adminView.switchTab('stores')">
              <i class="fas fa-store" style="margin-right: 8px;"></i>Tiendas
            </button>
            <button id="nav-users" class="admin-nav-btn ${this.activeTab === 'users' ? 'active' : ''}" onclick="window.adminView.switchTab('users')">
              <i class="fas fa-users" style="margin-right: 8px;"></i>Usuarios
            </button>
          </nav>
        </header>

        <main id="admin-view-content" class="admin-content-card">
          <!-- Dynamically Injected -->
        </main>
      </div>
    `;

        await this.loadStoresCache();
        await this.renderActiveTab();
        this.setupRealtime();
    }

    async switchTab(tab) {
        if (this.activeTab === tab) return;
        this.activeTab = tab;

        // Update Buttons
        document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`nav-${tab}`)?.classList.add('active');

        await this.renderActiveTab();
    }

    async loadStoresCache() {
        const { data } = await supabase.from('stores').select('id, name').eq('is_active', true);
        this.stores = data || [];
    }

    setupRealtime() {
        if (this.realtimeChannel) supabase.removeChannel(this.realtimeChannel);

        this.realtimeChannel = supabase.channel('admin-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, (payload) => {
                this.loadStoresCache();
                if (this.activeTab === 'stores' && this.storesTable) {
                    this.storesTable.refresh();
                    this.flashRow(payload.new?.id || payload.old?.id, 'stores');
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
                if (this.activeTab === 'users' && this.usersTable) {
                    this.usersTable.refresh();
                    this.flashRow(payload.new?.id || payload.old?.id, 'users');
                }
            })
            .subscribe();
    }

    flashRow(id, tab) {
        if (!id) return;
        setTimeout(() => {
            const tableId = tab === 'stores' ? 'adminStoresTable' : 'adminUsersTable';
            const tbody = document.getElementById(`${tableId}-tbody`);
            if (!tbody) return;

            const rows = tbody.querySelectorAll('tr');
            rows.forEach(r => {
                // Check if any button in the row contains the ID
                const buttons = r.querySelectorAll('button');
                buttons.forEach(b => {
                    if (b.getAttribute('onclick')?.includes(id)) {
                        r.classList.add('admin-row-updated');
                        setTimeout(() => r.classList.remove('admin-row-updated'), 2000);
                    }
                });
            });
        }, 500); // Wait for refresh
    }

    destroy() {
        if (this.realtimeChannel) supabase.removeChannel(this.realtimeChannel);
    }

    async renderActiveTab() {
        const content = document.getElementById('admin-view-content');
        if (this.activeTab === 'stores') {
            await this.renderStoresTab(content);
        } else {
            await this.renderUsersTab(content);
        }
    }

    // ==========================================
    // SECCIÓN TIENDAS
    // ==========================================

    async renderStoresTab(container) {
        container.innerHTML = `<div id="stores-table-wrapper" style="height: calc(100vh - 200px); margin-top: 1rem;"></div>`;

        this.storesTable = new AdvancedTable({
            container: document.getElementById('stores-table-wrapper'),
            id: 'adminStoresTable',
            title: 'Gestión de Sedes Operativas',
            columns: [
                {
                    key: 'name',
                    label: 'Nombre de Sede',
                    sortable: true,
                    formatter: (val, row) => `
            <div style="font-weight: 700; color: #1e293b;">${val}</div>
            <div style="font-size: 0.75rem; color: #64748b;">${row.address || 'Sin dirección registrada'}</div>
          `
                },
                { key: 'id', label: 'ID de Sede', align: 'center', formatter: (val) => `<code style="font-size: 0.7rem; color: #6366f1;">${val.substring(0, 8)}...</code>` },
                {
                    key: 'is_active',
                    label: 'Estado',
                    align: 'center',
                    formatter: (val) => `<span class="adv-table-badge ${val ? 'badge-success' : 'badge-error'}">${val ? 'Activa' : 'Inactiva'}</span>`
                },
                {
                    key: 'id',
                    label: 'Acciones',
                    align: 'right',
                    formatter: (val, row) => `
            <div class="action-btn-group">
              <button class="btn-circle" onclick="window.adminView.editStore('${row.id}')" title="Editar"><i class="fas fa-edit"></i></button>
              <button class="btn-circle" onclick="window.adminView.resetStoreInventory('${row.id}', '${row.name}')" title="Resetear Inventario"><i class="fas fa-sync-alt"></i></button>
              <button class="btn-circle danger" onclick="window.adminView.deleteStore('${row.id}', '${row.name}')" title="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
          `
                }
            ],
            toolbarActions: [
                { label: 'Nueva Tienda', icon: 'fas fa-plus', class: 'btn-ent btn-ent--primary', onClick: () => this.createStore() }
            ],
            fetchData: async (filters, sort) => {
                let query = supabase.from('stores').select('*');
                if (filters.search) query = query.ilike('name', `%${filters.search}%`);

                const { data, error } = await query.order(sort.column || 'name', { ascending: sort.direction === 'asc' });
                if (error) throw error;
                return data;
            }
        });

        await this.storesTable.render();
    }

    async createStore() {
        const { value: formValues } = await Swal.fire({
            title: 'Nueva Sede Operativa',
            html: `
        <div style="text-align: left;">
          <label style="font-size: 0.8rem; color: #64748b;">Nombre comercial</label>
          <input id="swal-store-name" class="swal2-input" placeholder="Ej: Sucursal Norte" style="margin: 5px 0 15px 0; width: 90%;">
          <label style="font-size: 0.8rem; color: #64748b;">Dirección física</label>
          <input id="swal-store-address" class="swal2-input" placeholder="Av. Principal #123" style="margin: 5px 0; width: 90%;">
        </div>
      `,
            showCancelButton: true,
            confirmButtonText: 'Crear Sede',
            confirmButtonColor: '#4f46e5',
            preConfirm: () => {
                const name = document.getElementById('swal-store-name').value;
                const address = document.getElementById('swal-store-address').value;
                if (!name) return Swal.showValidationMessage('El nombre es obligatorio');
                return { name, address };
            }
        });

        if (formValues) {
            const { error } = await supabase.from('stores').insert(formValues);
            if (error) Swal.fire('Error', error.message, 'error');
            else {
                Swal.fire('Éxito', 'Sede creada correctamente', 'success');
                this.storesTable.refresh();
                this.loadStoresCache();
            }
        }
    }

    async editStore(id) {
        const { data: store } = await supabase.from('stores').select('*').eq('id', id).single();
        if (!store) return;

        const { value: formValues } = await Swal.fire({
            title: 'Editar Sede',
            html: `
        <div style="text-align: left;">
          <label style="font-size: 0.8rem; color: #64748b;">Nombre comercial</label>
          <input id="swal-store-name" class="swal2-input" value="${store.name}" style="margin: 5px 0 15px 0; width: 90%;">
          <label style="font-size: 0.8rem; color: #64748b;">Dirección física</label>
          <input id="swal-store-address" class="swal2-input" value="${store.address || ''}" style="margin: 5px 0 15px 0; width: 90%;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="swal-store-active" ${store.is_active ? 'checked' : ''}>
            <label for="swal-store-active">Sede Activa</label>
          </div>
        </div>
      `,
            showCancelButton: true,
            confirmButtonText: 'Guardar Cambios',
            preConfirm: () => {
                return {
                    name: document.getElementById('swal-store-name').value,
                    address: document.getElementById('swal-store-address').value,
                    is_active: document.getElementById('swal-store-active').checked
                };
            }
        });

        if (formValues) {
            const { error } = await supabase.from('stores').update(formValues).eq('id', id);
            if (error) Swal.fire('Error', error.message, 'error');
            else {
                this.storesTable.refresh();
                this.loadStoresCache();
            }
        }
    }

    async deleteStore(id, name) {
        const { isConfirmed } = await Swal.fire({
            title: '¿Confirmar eliminación?',
            text: `Se intentará eliminar la tienda "${name}". Esta acción es irreversible.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Sí, eliminar sede'
        });

        if (isConfirmed) {
            const { data, error } = await supabase.rpc('admin_delete_store', { p_store_id: id });
            if (error) Swal.fire('Error de Acceso', error.message, 'error');
            else if (!data.success) Swal.fire('Imposible Eliminar', data.message, 'warning');
            else {
                Swal.fire('Eliminada', 'La sede ha sido marcada como inactiva/removida.', 'success');
                this.storesTable.refresh();
                this.loadStoresCache();
            }
        }
    }

    async resetStoreInventory(id, name) {
        const { value: confirmName } = await Swal.fire({
            title: 'REINICIO DE TIENDA',
            text: `Esta acción borrará TODO el stock y movimientos de "${name}". Escriba el nombre de la tienda para confirmar.`,
            input: 'text',
            inputPlaceholder: name,
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            confirmButtonText: 'BORRAR TODO EL INVENTARIO',
            inputValidator: (value) => { if (value !== name) return 'El nombre no coincide'; }
        });

        if (confirmName) {
            const { data, error } = await supabase.rpc('admin_reset_store_inventory', { p_store_id: id });
            if (error) Swal.fire('Error', error.message, 'error');
            else {
                Swal.fire('Reinicio Completado', 'El inventario de esta sede ha vuelto a cero.', 'success');
            }
        }
    }

    // ==========================================
    // SECCIÓN USUARIOS
    // ==========================================

    async renderUsersTab(container) {
        container.innerHTML = `<div id="users-table-wrapper" style="height: calc(100vh - 200px); margin-top: 1rem;"></div>`;

        this.usersTable = new AdvancedTable({
            container: document.getElementById('users-table-wrapper'),
            id: 'adminUsersTable',
            title: 'Directorio de Personal y Privilegios',
            columns: [
                {
                    key: 'full_name',
                    label: 'Usuario',
                    sortable: true,
                    formatter: (val, row) => `
            <div style="font-weight: 700;">${val || 'Nombre no definido'}</div>
            <div style="font-size: 0.7rem; color: #64748b;">UID: ${row.id.substring(0, 8)}...</div>
          `
                },
                {
                    key: 'role',
                    label: 'Rol',
                    align: 'center',
                    formatter: (val) => `<span class="badge-role ${val}">${val}</span>`
                },
                {
                    key: 'stores',
                    label: 'Sede Asignada',
                    formatter: (val) => val?.name || '<span style="color:#94a3b8">Acceso Global</span>'
                },
                {
                    key: 'is_active',
                    label: 'Status',
                    align: 'center',
                    formatter: (val) => `<i class="fas ${val ? 'fa-check-circle' : 'fa-times-circle'}" style="color: ${val ? '#10b981' : '#ef4444'}"></i>`
                },
                {
                    key: 'id',
                    label: 'Acciones',
                    align: 'right',
                    formatter: (val, row) => `
            <div class="action-btn-group">
              <button class="btn-circle" onclick="window.adminView.changeUserPassword('${row.id}', '${row.full_name}')" title="Restablecer Clave"><i class="fas fa-key"></i></button>
              <button class="btn-circle" onclick="window.adminView.editUser('${row.id}')" title="Editar Perfil"><i class="fas fa-user-edit"></i></button>
            </div>
          `
                }
            ],
            toolbarActions: [
                { label: 'Registrar Usuario', icon: 'fas fa-user-plus', class: 'btn-ent btn-ent--primary', onClick: () => this.createUser() }
            ],
            fetchData: async (filters, sort) => {
                let query = supabase.from('profiles').select('*, stores(name)');
                if (filters.search) query = query.ilike('full_name', `%${filters.search}%`);

                const { data, error } = await query.order(sort.column || 'full_name', { ascending: sort.direction === 'asc' });
                if (error) throw error;
                return data;
            }
        });

        await this.usersTable.render();
    }

    async createUser() {
        const { value: formValues } = await Swal.fire({
            title: 'Registrar Nuevo Empleado',
            html: `
        <div style="text-align: left;">
          <p style="font-size: 0.8rem; color: #ef4444; margin-bottom: 1rem; border: 1px solid #fee2e2; padding: 8px; border-radius: 6px; background: #fff5f5;">
            <i class="fas fa-shield-alt"></i> Atención: Esto creará una cuenta de acceso real y un perfil operativo.
          </p>

          <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Correo Electrónico (Login)</label>
          <input id="swal-user-email" type="email" class="swal2-input" placeholder="empleado@empresa.com" style="margin: 5px 0 15px 0; width: 90%;">
          
          <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Contraseña Inicial</label>
          <input id="swal-user-password" type="password" class="swal2-input" placeholder="Mínimo 6 caracteres" style="margin: 5px 0 15px 0; width: 90%;">

          <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Nombre Completo</label>
          <input id="swal-user-name" class="swal2-input" placeholder="Ej: Juan Pérez" style="margin: 5px 0 15px 0; width: 90%;">
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                  <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Rol Asignado</label>
                  <select id="swal-user-role" class="swal2-input" style="margin: 5px 0 15px 0; width: 100%; font-size: 0.9rem;">
                    <option value="clerk">Cajero / POS</option>
                    <option value="manager">Gerente de Sede</option>
                    <option value="warehouse">Bodeguero</option>
                    <option value="admin">Administrador</option>
                  </select>
              </div>
              <div>
                  <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Sede / Sucursal</label>
                  <select id="swal-user-store" class="swal2-input" style="margin: 5px 0 15px 0; width: 100%; font-size: 0.9rem;">
                     <option value="">Acceso Global</option>
                     ${this.stores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                  </select>
              </div>
          </div>
        </div>
      `,
            showCancelButton: true,
            confirmButtonText: 'Crear Cuenta y Perfil',
            confirmButtonColor: '#4f46e5',
            preConfirm: () => {
                const email = document.getElementById('swal-user-email').value;
                const password = document.getElementById('swal-user-password').value;
                const full_name = document.getElementById('swal-user-name').value;
                const role = document.getElementById('swal-user-role').value;
                const store_id = document.getElementById('swal-user-store').value;

                if (!email || !password || !full_name) {
                    return Swal.showValidationMessage('Todos los campos son obligatorios');
                }
                if (password.length < 6) {
                    return Swal.showValidationMessage('La contraseña debe tener al menos 6 caracteres');
                }
                return { email, password, full_name, role, store_id: store_id || null };
            }
        });

        if (formValues) {
            Swal.fire({ title: 'Procesando registro...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const { data, error } = await supabase.rpc('admin_create_user_account', {
                p_email: formValues.email,
                p_password: formValues.password,
                p_full_name: formValues.full_name,
                p_role: formValues.role,
                p_store_id: formValues.store_id
            });

            if (error) {
                Swal.fire('Error de Sistema', error.message, 'error');
            } else if (!data.success) {
                Swal.fire('Error de Registro', data.message, 'warning');
            } else {
                Swal.fire('¡Registrado!', `El usuario ${formValues.full_name} ha sido creado.`, 'success');
                this.usersTable.refresh();
            }
        }
    }

    async editUser(id) {
        const { data: user } = await supabase.from('profiles').select('*').eq('id', id).single();
        if (!user) return;

        const { value: formValues } = await Swal.fire({
            title: 'Actualizar Perfil',
            html: `
        <div style="text-align: left;">
          <label style="font-size: 0.8rem; color: #64748b;">Nombre completo</label>
          <input id="swal-user-name" class="swal2-input" value="${user.full_name}" style="margin: 5px 0 15px 0; width: 90%;">
          
          <label style="font-size: 0.8rem; color: #64748b;">Rol Operativo</label>
          <select id="swal-user-role" class="swal2-input" style="margin: 5px 0 15px 0; width: 95%;">
            <option value="clerk" ${user.role === 'clerk' ? 'selected' : ''}>Cajero / POS</option>
            <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Gerente de Sede</option>
            <option value="warehouse" ${user.role === 'warehouse' ? 'selected' : ''}>Encargado Bodega</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador Global</option>
          </select>

          <label style="font-size: 0.8rem; color: #64748b;">Sede de Trabajo</label>
          <select id="swal-user-store" class="swal2-input" style="margin: 5px 0 15px 0; width: 95%;">
             <option value="">-- Sin sede (Acceso Global) --</option>
             ${this.stores.map(s => `<option value="${s.id}" ${user.store_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
          
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="swal-user-active" ${user.is_active ? 'checked' : ''}>
            <label for="swal-user-active">Usuario Habilitado</label>
          </div>
        </div>
      `,
            showCancelButton: true,
            preConfirm: () => {
                return {
                    id: user.id,
                    full_name: document.getElementById('swal-user-name').value,
                    role: document.getElementById('swal-user-role').value,
                    store_id: document.getElementById('swal-user-store').value || null,
                    is_active: document.getElementById('swal-user-active').checked
                };
            }
        });

        if (formValues) {
            const { data, error } = await supabase.rpc('admin_upsert_profile', { p_payload: formValues });
            if (error) Swal.fire('Error', error.message, 'error');
            else this.usersTable.refresh();
        }
    }

    async changeUserPassword(id, name) {
        const isSelf = id === (await supabase.auth.getUser()).data.user?.id;

        const { value: newPassword } = await Swal.fire({
            title: isSelf ? 'Cambiar MI Contraseña' : `Resetear Clave: ${name}`,
            input: 'password',
            inputLabel: 'Nueva Contraseña',
            inputPlaceholder: 'Ingrese al menos 6 caracteres',
            showCancelButton: true,
            confirmButtonText: 'Actualizar Contraseña',
            confirmButtonColor: isSelf ? '#4f46e5' : '#f59e0b',
            inputAttributes: {
                autocapitalize: 'off',
                autocorrect: 'off'
            },
            inputValidator: (value) => {
                if (!value || value.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
            }
        });

        if (newPassword) {
            try {
                Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                if (isSelf) {
                    // Acción propia: Usar API estándar de Auth
                    const { error } = await supabase.auth.updateUser({ password: newPassword });
                    if (error) throw error;
                    Swal.fire('Éxito', 'Tu contraseña ha sido actualizada.', 'success');
                } else {
                    // Acción administrativa sobre otro usuario: Usar RPC (God Mode)
                    const { data, error } = await supabase.rpc('admin_reset_user_password', {
                        p_user_id: id,
                        p_new_password: newPassword
                    });

                    if (error) throw error;
                    if (!data.success) throw new Error(data.message);

                    Swal.fire('Restablecida', `La clave de ${name} ha sido cambiada por el sistema.`, 'success');
                }
            } catch (err) {
                Swal.fire('Error', err.message, 'error');
            }
        }
    }
}

