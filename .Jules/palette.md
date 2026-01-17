# Palette's Journal - Costpro UX & Accessibility

## 2025-05-14 - Initial Observations
**Learning:** The application uses a custom neumorphic UI system that relies heavily on `div` elements for interactive cards. This breaks standard keyboard navigation (Tab/Enter) and screen reader support.
**Action:** Convert key interactive elements from `div` to `button` or `a` tags and ensure all icon-only interactions have explicit ARIA labels.
