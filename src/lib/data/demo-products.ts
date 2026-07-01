export interface DemoProduct {
  id: string;
  name: string;
  status: 'valid' | 'error';
  price: number;
}

export const DEMO_DATASET: DemoProduct[] = Array.from({ length: 100 }, (_, i) => ({
  id: `demo-${i}`,
  name: `Producto Demo ${i + 1}`,
  status: Math.random() > 0.1 ? 'valid' : 'error',
  price: Math.floor(Math.random() * 1000) + 100
}));
