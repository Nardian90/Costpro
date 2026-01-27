/**
 * Utility for safe navigation to prevent app crashes during RSC payload fetch failures.
 */

export const safeNavigate = {
  push: (router: any, href: string) => {
    try {
      router.push(href);
    } catch (error) {
      console.error('[Navigation Error] Failed to push route:', href, error);
      // Fallback to browser navigation if router fails
      if (typeof window !== 'undefined') {
        window.location.href = href;
      }
    }
  },
  replace: (router: any, href: string) => {
    try {
      router.replace(href);
    } catch (error) {
      console.error('[Navigation Error] Failed to replace route:', href, error);
      if (typeof window !== 'undefined') {
        window.location.replace(href);
      }
    }
  }
};
