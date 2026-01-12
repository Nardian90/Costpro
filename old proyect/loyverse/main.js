import { authService } from './auth.js'
import ViewHeader from '../ui/components/ViewHeader.js'

export class LoyverseApp {
    constructor() {
        this.appContainer = document.getElementById('loyverse-app')
        this.currentView = null
        this.setupToggle()
        window.loyApp = this;
    }

    setupToggle() {
        window.toggleLoyverse = () => {
            const mainContent = document.querySelector('.app-container')
            const welcome = document.getElementById('costpro-welcome-system')
            const loyApp = document.getElementById('loyverse-app')

            // Try to find the button in the sidebar (shadow DOM or light DOM)
            const sidebarBtn = document.querySelector('button[data-action="toggle-loyverse"] span.text');

            if (loyApp.style.display === 'none' || !loyApp.style.display) {
                // Show Loyverse
                if (mainContent) mainContent.style.display = 'none'
                if (welcome) welcome.style.display = 'none'

                loyApp.style.display = 'block'
                if (sidebarBtn) sidebarBtn.textContent = 'Volver a CostPro';

                // Update icon if possible
                const sidebarIcon = document.querySelector('button[data-action="toggle-loyverse"] i');
                if (sidebarIcon) {
                    sidebarIcon.className = 'fa-solid fa-arrow-left';
                }

                this.init()
            } else {
                // Hide Loyverse
                loyApp.style.display = 'none'

                // Restore Main App
                if (mainContent) mainContent.style.display = 'flex'

                if (sidebarBtn) sidebarBtn.textContent = 'Tienda / POS';

                const sidebarIcon = document.querySelector('button[data-action="toggle-loyverse"] i');
                if (sidebarIcon) {
                    sidebarIcon.className = 'fa-solid fa-store';
                }
            }
        }
    }

    async init() {
        this.renderLayout()
        this.handleAuth()
    }

    renderLayout() {
        this.appContainer.innerHTML = `
      <div class="loy-layout">
        <nav class="loy-nav">
          <div style="display:flex; align-items:center; gap:15px;">
             <div id="loy-nav-action-slot"></div>
              <div id="loy-brand-group" class="loy-brand-group">
                 <!-- ViewHeader will be injected here -->
              </div>
          </div>
          <div class="loy-user-info" id="loy-user-info"></div>
          <button id="loy-logout" class="loy-btn-logout" style="display:none">Salir</button>
        </nav>
        <div id="loy-content" class="loy-content"></div>
      </div>
    `


        document.getElementById('loy-logout').addEventListener('click', async () => {
            await authService.signOut()
            window.location.reload()
        })

    }

    async handleAuth() {
        try {
            const user = await authService.getUser()
            if (!user) {
                this.renderLogin()
            } else {
                try {
                    const profile = await authService.getProfile(user.id)
                    this.updateUserInfo(profile)
                    this.routeUser(profile)
                } catch (err) {
                    console.error('Profile load error:', err)
                    // PGRST116 is code for 0 rows from .single()
                    if (err.code === 'PGRST116' || err.message.includes('JSON object requested, multiple (or no) rows returned')) {
                        this.renderNoProfile(user)
                    } else {
                        throw err
                    }
                }
            }
        } catch (e) {
            console.error('Auth flow error:', e)
            document.getElementById('loy-content').innerHTML = `<div class="error-msg" style="padding:20px;">Error fatal de autenticación: ${e.message}</div>`
        }
    }

    renderNoProfile(user) {
        document.getElementById('loy-content').innerHTML = `
        <div class="loy-login-container">
            <h2>¡Casi listo!</h2>
            <p>Tu cuenta de usuario existe, pero aún no tiene un Perfil asignado en la base de datos.</p>
            <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0; text-align:left; word-break:break-all;">
                <strong>Tu UID es:</strong><br>
                <code style="color:#e91e63;">${user.id}</code>
            </div>
            <p class="loy-login-subtitle">
                Copia este UID y ejecuta el script SQL de "INSERT INTO profiles" reemplazando el ID.
            </p>
            <button onclick="window.location.reload()" class="loy-btn-primary">Recargar tras ejecutar SQL</button>
            <button onclick="authService.signOut().then(() => window.location.reload())" style="margin-top:10px; background:none; border:none; text-decoration:underline; cursor:pointer;">Cerrar Sesión</button>
        </div>
      `
        // Expose authService specifically for this button if needed, although module import usage in onclick is tricky. 
        // Better to attach event listener or ensure global access. 
        // Since 'authService' is imported in this file, it's not global.
        // I will rely on the fact that I can attach listeners to the buttons after setting innerHTML.
        setTimeout(() => {
            const btnLogout = document.querySelector('button[onclick*="signOut"]')
            if (btnLogout) {
                btnLogout.removeAttribute('onclick')
                btnLogout.onclick = async () => { await authService.signOut(); window.location.reload(); }
            }
        }, 0)
    }

    updateUserInfo(profile) {
        const infoEl = document.getElementById('loy-user-info')
        const logoutBtn = document.getElementById('loy-logout')
        if (profile) {
            this.userProfile = profile; // Save for header
            logoutBtn.style.display = 'block'
        } else {
            this.userProfile = null;
            logoutBtn.style.display = 'none'
        }
    }

    /**
     * Dynamically update the navbar brand title
     * @param {string} title 
     */
    updateNavTitle(title) {
        const brandGroup = document.getElementById('loy-brand-group');
        if (brandGroup) {
            brandGroup.innerHTML = ViewHeader.render(title, this.userProfile?.full_name, true);
        }
    }

    async routeUser(profile) {
        // Simple role-based routing
        const contentEl = document.getElementById('loy-content')
        contentEl.innerHTML = '<div class="loading">Cargando panel...</div>'

        try {
            if (profile.role === 'admin') {
                await this.loadView('AdminView')
            } else if (profile.role === 'manager') {
                await this.loadView('ManagerView')
            } else if (profile.role === 'clerk' || profile.role === 'cashier') {
                await this.loadView('CashierPOSView')
            } else if (profile.role === 'warehouse') {
                await this.loadView('WarehouseView')
            } else {
                contentEl.innerHTML = '<div class="error">Rol no reconocido contacte al administrador.</div>'
            }
        } catch (err) {
            console.error('Error routing user:', err)
            contentEl.innerHTML = `<div class="error">Error cargando vista: ${err.message}</div>`
        }
    }

    async loadView(viewName) {
        const contentEl = document.getElementById('loy-content')
        if (!contentEl) return;

        // 1. Load View-Specific CSS
        this.loadViewStyles(viewName)

        // 2. Dynamic import for views
        try {
            // Dynamic import for views with cache bursting
            const module = await import(`./views/${viewName}.js?t=${new Date().getTime()}`)

            // Cleanup previous view if needed
            if (this.currentView && typeof this.currentView.destroy === 'function') {
                this.currentView.destroy()
            }

            this.currentView = new module.default(contentEl)
            await this.currentView.render()
        } catch (e) {
            console.error(`Failed to load ${viewName}`, e)
            contentEl.innerHTML = `<h3>Error al cargar el módulo ${viewName}</h3>`
        }
    }

    /**
     * Dynamically loads CSS for the current view
     * Only loads CSS for views that have dedicated stylesheets
     * @param {string} viewName 
     */
    loadViewStyles(viewName) {
        // List of views that have dedicated CSS files
        const viewsWithCSS = ['CashierPOSView', 'POSView'];

        // Remove previous view styles
        const existingStyles = document.querySelectorAll('link[data-view-style]')
        existingStyles.forEach(el => el.remove())

        // Only load CSS if this view has a dedicated stylesheet
        if (!viewsWithCSS.includes(viewName)) {
            console.log(`View ${viewName} uses default styles (no dedicated CSS)`)
            return;
        }

        // Create new link element
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `./src/loyverse/views/${viewName}.css?t=${new Date().getTime()}`
        link.setAttribute('data-view-style', 'true')

        // Handle views that might not have a dedicated CSS (fallback to main styles)
        link.onerror = () => {
            console.warn(`CSS for ${viewName} not found, using defaults.`);
            link.remove();
        }

        document.head.appendChild(link)
    }

    renderLogin() {
        const contentEl = document.getElementById('loy-content')
        contentEl.innerHTML = `
      <div class="loy-login-container">
        <h2>Bienvenido</h2>
        <p class="loy-login-subtitle">Accede a tu panel de gestión de tiendas</p>
        <form id="loy-login-form">
          <div class="form-group">
            <label>Correo Electrónico</label>
            <input type="email" id="email" placeholder="ej. usuario@empresa.com" required>
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" id="password" placeholder="••••••••" required>
          </div>
          <button type="submit" class="loy-btn-primary">Iniciar Sesión</button>
        </form>
        <div id="login-error" class="error-msg"></div>
        <p style="margin-top:1rem; font-size:0.8rem; color: #888;">Credenciales ejemplo: admin@demo.com / 456</p>
      </div>
    `

        document.getElementById('loy-login-form').addEventListener('submit', async (e) => {
            e.preventDefault()
            const email = e.target.email.value
            const password = e.target.password.value
            const errorEl = document.getElementById('login-error')
            const btn = e.target.querySelector('button')

            try {
                errorEl.textContent = ''
                btn.textContent = 'Verificando...'
                btn.disabled = true
                await authService.login(email, password)
                this.handleAuth() // Reload state
            } catch (err) {
                console.error(err)
                let msg = err.message || 'Credenciales inválidas'
                if (msg.includes('Email not confirmed')) {
                    msg = 'Email no confirmado. Revisa tu correo o desactiva "Confirm Email" en Supabase > Auth > Providers.'
                } else if (msg.includes('Invalid login credentials')) {
                    msg = 'Usuario o contraseña incorrectos.'
                } else if (msg.includes('Email logins are disabled')) {
                    msg = 'El inicio de sesión por Email está desactivado. Habilítalo en Supabase > Authentication > Providers > Email.'
                }
                errorEl.textContent = 'Error: ' + msg
                btn.textContent = 'Iniciar Sesión'
                btn.disabled = false
            }
        })
    }
}
