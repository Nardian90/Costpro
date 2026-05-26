/**
 * @file Contrato de datos estricto para la entidad Product.
 * @description Define la estructura de datos que el frontend DEBE esperar
 * para un producto. Elimina `null` y `undefined` para garantizar
 * consistencia y previsibilidad.
 */
export interface ProductContract {
  id: string;
  name: string;
  description: string;
  sku: string;
  barcode: string;
  barcodeType: string;
  price: number;
  costPrice: number;
  imageUrl: string;
  category: string;
  unitOfMeasure: string;
  supplier: string;
  createdAt: string;
  updatedAt: string;
  stockCurrent: number;
  costAverage: number;
  minStock: number;
  storeId: string;
  publicImageUrl: string;
}

/**
 * Fábrica para crear objetos ProductContract con valores predeterminados seguros.
 */
export const ProductFactory = {
  create: (initialValues?: Partial<ProductContract>): ProductContract => ({
    id: '',
    name: '',
    description: '',
    sku: '',
    barcode: '',
    barcodeType: 'auto',
    price: 0,
    costPrice: 0,
    imageUrl: '',
    category: '',
    unitOfMeasure: 'unidad',
    supplier: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stockCurrent: 0,
    costAverage: 0,
    minStock: 0,
    storeId: '',
    publicImageUrl: '',
    ...initialValues,
  }),
};
