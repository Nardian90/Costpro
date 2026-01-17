## 2026-01-17 - [Redundant Modal and Filter Optimization]
**Learning:** Found duplicate modal implementations in `src/app/page.tsx`, one of which used an undefined state variable (`loadingItems`), indicating it was a broken copy. Also identified `useEffect` + `useState` anti-pattern for filtering lists, which causes extra render cycles.
**Action:** Removed the redundant broken modal to reduce DOM complexity. Replaced `useEffect` filtering with `useMemo` across multiple components to consolidate render cycles and improve UI responsiveness during search.
