## 2026-01-17 - [Redundant Modal and Filter Optimization]
**Learning:** Found duplicate modal implementations in `src/app/page.tsx`, one of which used an undefined state variable (`loadingItems`), indicating it was a broken copy. Also identified `useEffect` + `useState` anti-pattern for filtering lists, which causes extra render cycles.
**Action:** Removed the redundant broken modal to reduce DOM complexity. Replaced `useEffect` filtering with `useMemo` across multiple components to consolidate render cycles and improve UI responsiveness during search.

## 2025-01-24 - [Derived Property Memoization Optimization]
**Learning:** Found that calculating Supabase public image URLs inside React render loops (mapping over large product lists) caused redundant string manipulation and SDK overhead on every keystroke in search filters. Synchronous derived values like these are better calculated once during data fetching.
**Action:** Centralized image URL logic in a shared utility and added a `public_image_url` field to the `Product` type. Pre-calculating this field during the `fetchProducts` phase reduced the render-time work from O(N*R) to O(N).

## 2026-01-18 - [Lazy Loading and Deferred Search Optimization]
**Learning:** Found that `TerminalView.tsx` was fetching all administrative data (Audit, Users, History) on initial mount, even for users without those permissions or for views not currently active. Also identified UI lag when filtering the product grid due to synchronous search state updates on every keystroke.
**Action:** Implemented lazy data fetching in `TerminalView.tsx` by moving non-essential API calls into a separate `useEffect` that triggers based on the `currentView`. Introduced `useDeferredValue` for the search filter and replaced inline product JSX with the memoized `ProductCard` component, significantly improving POS responsiveness and initial load speed.
