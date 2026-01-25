
'use client';
import ProductImage from '@/components/ui/ProductImage';
import { ProductCard } from '@/components/ui/atomic';
const mockProduct = {
  id: 'test-1',
  name: 'Test Product',
  image_url: null,
  public_image_url: null,
  price: 100,
  cost_price: 80,
  stock_current: 5,
  min_stock: 10,
  category: 'Testing',
  description: 'A test product description'
} as any;
export default function TestPage() {
  return (
    <div className="p-10 space-y-10 bg-background min-h-screen">
      <h1 className="text-2xl font-bold">ProductImage Atom Verification</h1>
      <div className="grid grid-cols-2 gap-10">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">ProductImage (No Image)</h2>
          <div className="w-40 h-40 border border-dashed border-primary/20">
            <ProductImage name="Test Product" />
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">ProductCard (Inventory Variant)</h2>
          <div className="w-80">
            <ProductCard product={mockProduct} variant="inventory" />
          </div>
        </div>
      </div>
    </div>
  );
}
