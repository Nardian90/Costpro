import { BrowserContext, Page } from '@playwright/test';

export async function mockAuthState(context: BrowserContext, userRole: 'admin' | 'manager' | 'vendedor' = 'admin') {
  const authState = {
    state: {
      user: {
        id: 'mock-user-id',
        fullName: 'Mock ' + userRole,
        email: userRole + '@demo.com',
        role: userRole,
        activeStoreId: 'store-123',
        memberships: [
          {
            store_id: 'store-123',
            role: userRole,
            status: 'active',
            store: { name: 'Tienda Mock' }
          }
        ]
      },
      token: 'mock-token',
      status: 'authenticated_valid',
      loading: false,
      isMocked: true
    },
    version: 0
  };

  await context.addInitScript((state) => {
    window.localStorage.setItem('auth-storage', JSON.stringify(state));
  }, authState);
}

export async function mockView(context: BrowserContext, viewId: string) {
  const uiState = {
    state: {
      currentView: viewId,
      sidebarOpen: false
    },
    version: 0
  };

  await context.addInitScript((state) => {
    window.localStorage.setItem('ui-storage', JSON.stringify(state));
  }, uiState);
}

export async function bypassSplash(page: Page) {
  // Wait for the main terminal shell to appear (usually the second main tag)
  // We use a high timeout because the dev server can be slow
  await page.locator('main').nth(1).waitFor({ state: 'visible', timeout: 60000 });
}
