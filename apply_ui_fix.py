import sys

file_path = 'src/components/IntelligentThemeHandler.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Change 1: toggleUIMode - remove the restrictive check for prefers-reduced-motion
old_1 = """  // Respect prefers-reduced-motion: don't allow enhanced if user prefers reduced motion
  if (next === 'enhanced' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    html.classList.remove('mode-enhanced');
    html.classList.add('mode-performance');
    localStorage.setItem(MODE_KEY, 'performance');
    return 'performance';
  }"""

new_1 = """  // Respect manual override over prefers-reduced-motion"""

if old_1 in content:
    content = content.replace(old_1, new_1)

# Change 2: getCurrentUIMode - prioritize localStorage
old_2 = """export function getCurrentUIMode(): UIMode {
  if (typeof window === 'undefined') return 'enhanced';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'performance';
  return (localStorage.getItem(MODE_KEY) as UIMode) || 'enhanced';
}"""

new_2 = """export function getCurrentUIMode(): UIMode {
  if (typeof window === 'undefined') return 'enhanced';
  const stored = localStorage.getItem(MODE_KEY) as UIMode | null;
  if (stored) return stored;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'performance';
  return 'enhanced';
}"""

if old_2 in content:
    content = content.replace(old_2, new_2)

with open(file_path, 'w') as f:
    f.write(content)

# Fix Store default view
file_path_store = 'src/store/index.ts'
with open(file_path_store, 'r') as f:
    store_content = f.read()

# I will use a different approach for the default view.
# The user wants "al cargar la aplicacion debe ser la vista occ".
# If it's persisted, it might load the old view.
# I will add a simple useEffect in a root component or modify the store to not persist currentView if possible,
# or just ensure it's 'occ' on first load if it's not set.

# Actually, the store says: currentView: 'occ'.
# But persistence might be overriding it with 'cost-sheets' or something else from the last session.

# I will modify the persist config to exclude currentView if they always want 'occ' on start.

old_store = """    {
      name: 'costpro-ui-storage',
      version: 2,"""

new_store = """    {
      name: 'costpro-ui-storage',
      version: 2,
      partialize: (state) => {
        const { currentView, ...rest } = state;
        return rest;
      },"""

if old_store in store_content:
    store_content = store_content.replace(old_store, new_store)

with open(file_path_store, 'w') as f:
    f.write(store_content)
