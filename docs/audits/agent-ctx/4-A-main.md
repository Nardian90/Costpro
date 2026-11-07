---
Task ID: 4-A
Agent: Main Agent
Task: FASE 4 — WCAG 2.2 AA Accessibility: ESLint a11y config + useFocusTrap hook

Work Log:
- Read worklog.md and assessed current project state (FASE 1-3 complete)
- Installed eslint-plugin-jsx-a11y@6.10.2 as dev dependency
- Updated eslint.config.mjs:
  - Added 8 jsx-a11y rules for WCAG 2.2 AA compliance
  - Note: jsx-a11y plugin already provided by eslint-config-next/core-web-vitals, so no separate plugin import needed
  - Fixed 2 rule names from task spec to match actual plugin API:
    - `aria-label-has-associated-control` → `control-has-associated-label` (correct rule name in v6.10.2)
    - `button-has-type` → removed (rule doesn't exist in eslint-plugin-jsx-a11y)
- Added `lint:a11y` script to package.json
- Created `src/hooks/ui/useFocusTrap.ts` (68 lines):
  - Focus trap hook for modals and panels (WCAG 2.2 Criterio 2.1.2)
  - Auto-focuses first focusable element on activation
  - Tab/Shift+Tab cycling within container
  - Restores previous focus on deactivation
  - 50ms delay for DOM readiness

Stage Summary:
- eslint-plugin-jsx-a11y configured with 8 WCAG 2.2 AA rules in flat config format
- lint:a11y script available for accessibility-specific linting
- useFocusTrap hook ready for modal/dialog components
- All jsx-a11y rules verified active (control-has-associated-label, label-has-associated-control, etc. firing correctly)
- Zero tsc errors in new/modified files
- Pre-existing lint issues (231 problems) are unchanged — none introduced by this task
