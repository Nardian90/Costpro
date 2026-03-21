import { TransformType } from './mapping.types';

export const TransformationRegistry: Record<TransformType, (value: any) => any> = {
  trim: (v) => (typeof v === 'string' ? v.trim() : v),
  toUpperCase: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
  toLowerCase: (v) => (typeof v === 'string' ? v.toLowerCase() : v),
  toNumber: (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? v : num;
    }
    return v;
  },
  parseDate: (v) => {
    if (v instanceof Date) return v.toISOString().split('T')[0];
    if (typeof v === 'string') {
      const parts = v.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) return v;
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return v;
  },
  removeSymbols: (v) => (typeof v === 'string' ? v.replace(/[^a-zA-Z0-9 ]/g, '') : v),
  extractDigits: (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : v),
  currencyNormalize: (v) => {
    if (typeof v === 'number') return Math.round(v * 100);
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? v : Math.round(num * 100);
    }
    return v;
  }
};
