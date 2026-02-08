export interface DemoProduct {
  sku: string;
  name: string;
  price: number;
  cost?: number;
  stock: number;
  unit: string;
  status: 'valid' | 'error';
  errorType?: 'cost_missing' | 'stock_zero' | 'rule_violation';
}

export const generateDemoProducts = (): DemoProduct[] => {
  const products: DemoProduct[] = [];

  // Real names for a bakery/restaurant context
  const prefixes = ['Pan', 'Tarta', 'Dulce', 'Café', 'Refresco', 'Sandwich', 'Pizza', 'Ensalada'];
  const suffixes = ['Artesano', 'Especial', 'de la Casa', 'Premium', 'Gourmet', 'Clásico', 'Integrale'];

  for (let i = 1; i <= 100; i++) {
    const isError = i > 90;
    let errorType: DemoProduct['errorType'];
    let cost = 5 + Math.random() * 20;
    let stock = 10 + Math.floor(Math.random() * 100);

    if (isError) {
      if (i % 3 === 0) {
        errorType = 'cost_missing';
        cost = undefined;
      } else if (i % 3 === 1) {
        errorType = 'stock_zero';
        stock = 0;
      } else {
        errorType = 'rule_violation';
      }
    }

    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

    products.push({
      sku: `PROD-${1000 + i}`,
      name: `${prefix} ${suffix} #${i}`,
      price: cost ? cost * 1.4 : 25,
      cost,
      stock,
      unit: 'u',
      status: isError ? 'error' : 'valid',
      errorType
    });
  }

  return products;
};

export const DEMO_DATASET = generateDemoProducts();
