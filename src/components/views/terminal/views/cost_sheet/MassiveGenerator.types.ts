import React from 'react';
import { ExportOptions } from './CostSheetExportModal';

export interface MassiveResult {
  um?: string;
  quantity?: number;
  sku: string;
  name: string;
  cost: number;
  salePrice: number;
  utility: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface MappingConfig {
  targetColumn: 'price' | 'cost' | 'none' | 'sale_price' | 'total_cost';
  modificationRow: string;
}

export interface ProductItem {
  sku?: string;
  name?: string;
  unit_of_measure?: string;
  um?: string;
  quantity?: number;
  price?: number;
  cost?: number;
  sale_price?: number;
  salePrice?: number;
  [key: string]: unknown;
}

export interface CostSheetMassiveGeneratorProps {
  isOpen?: boolean;
  onClose?: () => void;
  isSection?: boolean;
  initialProducts?: ProductItem[];
  initialMapping?: { targetColumn: 'sale_price' | 'total_cost'; modificationRow: string };
  autoStart?: boolean;
  isQuickAction?: boolean;
}

export interface RunMassiveGenerationParams {
  isQuickAction: boolean;
  products: ProductItem[];
  selectedIds: Set<string>;
  currentSheet: Record<string, unknown>;
  mappingConfig: MappingConfig;
  exportOptions: ExportOptions;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  isProcessingRef: React.MutableRefObject<boolean>;
  setResults: React.Dispatch<React.SetStateAction<MassiveResult[]>>;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
}
