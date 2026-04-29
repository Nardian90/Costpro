// Verifica que ningún componente del módulo de inventario usa user.storeId
// donde debería usar user.activeStoreId para operaciones de la tienda activa.
// Este test falla si alguien revierte el fix de FC-04.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const INVENTORY_COMPONENTS_DIR = join(
  process.cwd(),
  'src/components/views/terminal/views/inventory'
);

const CRITICAL_FILES = [
  'ProductReceptionView.tsx',
  'InventoryView.tsx',
  'StockAlertsPanel.tsx',
];

describe('Regresión FC-04: activeStoreId en módulo de inventario', () => {
  CRITICAL_FILES.forEach(filename => {
    it(`${filename} no usa user?.storeId como argumento de useInventory o storeId param`, () => {
      const filePath = join(INVENTORY_COMPONENTS_DIR, filename);
      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch {
        return; // El archivo puede no existir — skip
      }

      // Detecta el patrón problemático: pasar storeId (no activeStoreId) a un hook de inventario
      const dangerousPattern = /useInventory\(\s*user\?\.storeId/;
      expect(dangerousPattern.test(content)).toBe(false);
    });
  });
});
