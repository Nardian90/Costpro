# 🚀 POS CSS Quick Reference Card

## 📱 Responsive Breakpoints

```css
/* Mobile First - Default (≤480px) */
.element { ... }

/* Tablet Portrait (≥481px) */
@media (min-width: 481px) { ... }

/* Tablet Landscape (≥769px) */
@media (min-width: 769px) { ... }

/* Desktop (≥1025px) */
@media (min-width: 1025px) { ... }
```

---

## 🎨 Color Variables Quick Reference

```css
/* Primary Actions */
--color-primary-600: #2563eb;

/* Success (Prices, Confirmations) */
--color-success-600: #16a34a;

/* Warning (Processing) */
--color-warning-500: #f59e0b;

/* Error (Out of Stock) */
--color-error-600: #dc2626;

/* Text Colors */
--color-gray-900: #0f172a;  /* Primary text */
--color-gray-600: #475569;  /* Secondary text */
--color-gray-400: #94a3b8;  /* Placeholder text */

/* Backgrounds */
--color-gray-50: #f8fafc;   /* Light background */
--color-gray-100: #f1f5f9;  /* Card background */

/* Borders */
--color-gray-200: #e2e8f0;  /* Light borders */
--color-gray-300: #cbd5e1;  /* Medium borders */
```

---

## 📐 Spacing Scale

```css
--space-1: 0.25rem;   /* 4px  - Micro */
--space-2: 0.5rem;    /* 8px  - Tight */
--space-3: 0.75rem;   /* 12px - Compact */
--space-4: 1rem;      /* 16px - Base ★ */
--space-5: 1.25rem;   /* 20px - Comfortable */
--space-6: 1.5rem;    /* 24px - Loose */
--space-8: 2rem;      /* 32px - Section */
--space-12: 3rem;     /* 48px - Large */
```

**★ Default**: Use `--space-4` (16px) for most spacing needs.

---

## 🔤 Typography Scale

```css
--font-size-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);   /* 12-14px */
--font-size-sm: clamp(0.875rem, 0.8rem + 0.3vw, 1rem);       /* 14-16px */
--font-size-base: clamp(1rem, 0.95rem + 0.3vw, 1.125rem);    /* 16-18px ★ */
--font-size-lg: clamp(1.125rem, 1rem + 0.5vw, 1.25rem);      /* 18-20px */
--font-size-xl: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);      /* 20-24px */
--font-size-2xl: clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem);    /* 24-30px */
```

**★ Default**: Use `--font-size-base` for body text.

---

## 🎯 Border Radius

```css
--radius-sm: 0.375rem;  /* 6px  - Small elements */
--radius-md: 0.5rem;    /* 8px  - Buttons, inputs ★ */
--radius-lg: 0.75rem;   /* 12px - Cards */
--radius-xl: 1rem;      /* 16px - Containers */
```

**★ Default**: Use `--radius-md` (8px) for most elements.

---

## 🔍 Shadows

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);                /* Subtle */
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), ...;         /* Cards ★ */
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), ...;       /* Elevated */
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), ...;       /* Modals */
--shadow-focus: 0 0 0 3px rgba(59, 130, 246, 0.3);           /* Focus ring */
```

**★ Default**: Use `--shadow-md` for cards and containers.

---

## ⚡ Transitions

```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);   /* Micro-interactions ★ */
--transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);   /* Standard */
--transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);   /* Emphasis */
```

**★ Default**: Use `--transition-fast` (150ms) for button feedback.

---

## ♿ Accessibility Checklist

### ✅ Touch Targets
```css
button {
  min-width: 44px;
  min-height: 44px;
}
```

### ✅ Focus States
```css
*:focus-visible {
  outline: 2px solid var(--color-primary-600);
  outline-offset: 2px;
}
```

### ✅ Color Contrast
- Primary text on white: **12.6:1** (AAA)
- Secondary text on white: **5.8:1** (AA)
- Success button: **4.7:1** (AA)

### ✅ Keyboard Navigation
- Tab: Navigate forward
- Shift+Tab: Navigate backward
- Enter/Space: Activate
- Escape: Close modals

---

## 🧩 Common Patterns

### Grid Layout (Responsive Products)
```css
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-4);
}
```

### Flexbox (Header with Space Between)
```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
}
```

### Touch-Friendly Button
```css
.button {
  min-height: 44px;
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-base);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.button:active {
  transform: scale(0.98);
}
```

### Card Component
```css
.card {
  background: white;
  border: 2px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-fast);
}

.card:hover {
  border-color: var(--color-primary-600);
  box-shadow: var(--shadow-lg);
}
```

---

## 📱 Mobile-Specific Utilities

### Disable Text Selection (Product Cards)
```css
.product-card {
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
```

### Prevent Double-Tap Zoom (Critical Buttons)
```css
.checkout-button {
  touch-action: manipulation;
}
```

### Smooth Scrolling
```css
.scrollable {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
```

---

## 🎯 Component State Classes

### Product States
```css
.out-of-stock { opacity: 0.5; cursor: not-allowed; }
.stock-updated-flash { animation: stockFlash 1s; }
```

### Button States
```css
.processing { animation: pulse 1.5s infinite; }
:disabled { opacity: 0.5; cursor: not-allowed; }
```

### Stock Badge Variants
```css
.stock-ok { background: var(--color-success-100); }
.stock-low { background: var(--color-warning-100); }
.stock-empty { background: var(--color-error-100); }
```

---

## 🔥 Performance Tips

### GPU Acceleration
```css
.animated-element {
  will-change: transform;
  transform: translateZ(0);
}
```

### Layout Containment
```css
.scrollable-list {
  contain: layout style paint;
}
```

### Efficient Animations
```css
/* ✅ GOOD: GPU-accelerated */
transition: transform 150ms, opacity 150ms;

/* ❌ BAD: Triggers reflow */
transition: width 150ms, height 150ms;
```

---

## 🚨 Common Mistakes to Avoid

### ❌ DON'T
```css
/* Hardcoded values */
margin: 16px;
color: #2563eb;
font-size: 14px;

/* Layout-shifting animations */
transition: height 200ms;

/* Hover-only functionality */
.element:hover { display: block; }
```

### ✅ DO
```css
/* Use CSS variables */
margin: var(--space-4);
color: var(--color-primary-600);
font-size: var(--font-size-sm);

/* GPU-accelerated animations */
transition: transform 200ms;

/* Touch-friendly with hover enhancement */
.element { display: block; }
@media (hover: hover) {
  .element:hover { opacity: 0.8; }
}
```

---

## 🧪 Testing Commands

### Browser DevTools
```javascript
// Test responsive breakpoints
window.innerWidth  // Current viewport width

// Test color contrast
getComputedStyle(element).color
getComputedStyle(element).backgroundColor

// Test focus states
document.activeElement  // Currently focused element
```

### Accessibility Testing
```bash
# Install axe DevTools extension
# Run automated accessibility scan

# Keyboard test: Use Tab key only
# Screen reader test: Enable VoiceOver/NVDA
```

---

## 📊 Performance Checklist

- [ ] Images optimized (WebP, lazy loading)
- [ ] Animations ≤300ms
- [ ] Touch targets ≥44px
- [ ] CLS (Cumulative Layout Shift) = 0
- [ ] First Contentful Paint <1.5s
- [ ] Lighthouse Accessibility ≥95

---

## 🎓 Remember

1. **Mobile-first**: Start small, enhance up
2. **Accessibility**: Keyboard + touch + screen readers
3. **Performance**: GPU-accelerated transforms only
4. **Variables**: Never hardcode colors/spacing
5. **Touch targets**: Always ≥44px
6. **Focus**: Always visible for keyboard users
7. **Contrast**: Always meet WCAG AA (4.5:1)
8. **Animations**: Always ≤300ms

---

## 🔗 Related Files

- `CashierPOSView.css` - Main stylesheet
- `CashierPOSView_CSS_ARCHITECTURE.md` - Full documentation
- `CashierPOSView.js` - JavaScript component

---

**Version:** 3.0.0 Enterprise Edition  
**Last Updated:** 2026-01-06

🎯 **Happy Coding!**
