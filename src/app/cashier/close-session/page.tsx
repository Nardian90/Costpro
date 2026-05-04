"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BaseModal } from "@/components/ui/BaseModal";
import { Product, ProductVariant } from "@/types";
import { useAuthStore } from "@/store";
import { useCartStore } from "@/store/cart";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Difference {
  productId: string;
  name: string;
  expected: number;
  counted: number;
  diff: number;
  variants: ProductVariant[];
  decomposition?: { variantId: string; name: string; quantity: number }[];
}

export default function CloseSessionPage() {
  const { user, token } = useAuthStore();
  const router = useRouter();
  const setCart = useCartStore((state) => state.setCart);
  const [products, setProducts] = useState<(Product & { product_variants: ProductVariant[] })[]>([]);
  const [countedQuantities, setCountedQuantities] = useState<{ [key: string]: number | undefined }>({});
  const [differences, setDifferences] = useState<Difference[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!token) return;
      try {
        const response = await fetch("/api/inventory/products", {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!response.ok) throw new Error("Failed to fetch products");
        const data = await response.json();
        setProducts(data);
      } catch (error: any) {
        console.error(error);
        toast.error("Error al cargar productos: " + error.message)
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const handleQuantityChange = (productId: string, value: string) => {
    const quantity = parseInt(value, 10);
    setCountedQuantities((prev) => ({
      ...prev,
      [productId]: isNaN(quantity) ? undefined : quantity,
    }));
  };

  const calculateOptimalDecomposition = (diff: number, variants: ProductVariant[]) => {
    let remaining = Math.abs(diff);
    const sortedVariants = [...variants].sort((a, b) => b.conversion_factor - a.conversion_factor);
    const decomposition: { variantId: string; name: string; quantity: number }[] = [];

    for (const variant of sortedVariants) {
      if (remaining >= variant.conversion_factor && variant.conversion_factor > 0) {
        const count = Math.floor(remaining / variant.conversion_factor);
        decomposition.push({ variantId: variant.id, name: variant.name, quantity: count });
        remaining %= variant.conversion_factor;
      }
    }
    return decomposition;
  };

  const handleInitialSubmit = () => {
    const diffs = products
      .map((p) => {
        const counted = countedQuantities[p.id];
        if (counted === undefined) return null;
        return {
          productId: p.id,
          name: p.name,
          expected: p.stock_current,
          counted: counted,
          diff: counted - p.stock_current,
          variants: p.product_variants,
        };
      })
      .filter((d): d is Difference => d !== null && d.diff !== 0);

    const processedDiffs = diffs.map(d => ({
      ...d,
      decomposition: d.diff < 0 ? calculateOptimalDecomposition(d.diff, d.variants) : undefined
    }));

    setDifferences(processedDiffs);
    if (processedDiffs.length > 0) setIsModalOpen(true);
  };

  const handleFinalSubmit = async () => {
    if (!user?.activeStoreId) return;
    setIsSubmitting(true);

    const itemsToSubmit = differences.map(d => ({
      product_id: d.productId,
      expected_quantity: d.expected,
      counted_quantity: d.counted,
      decomposition: d.decomposition?.map(dec => ({
        variant_id: dec.variantId,
        quantity: dec.quantity
      }))
    }));

    const storeId = user.activeStoreId;

    try {
      const response = await fetch("/api/inventory/adjustments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ storeId, items: itemsToSubmit }),
      });

      if (!response.ok) throw new Error("Failed to submit adjustment");

      const result = await response.json();
      setCart(result.saleId, result.saleItems);
      router.push("/cashier");

    } catch (error: any) {
      console.error(error);
      toast.error("Error al procesar el ajuste: " + error.message)
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div>Cargando productos...</div>;

  const allProductsCounted = products.every(
    (p) => countedQuantities[p.id] !== undefined
  );

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Conteo de Inventario - Cierre de Caja</CardTitle>
        </CardHeader>
        <CardContent>
          {products.map((product) => (
            <div key={product.id} className="grid grid-cols-3 gap-4 items-center mt-2">
              <div>{product.name}</div>
              <div>{product.stock_current}</div>
              <div>
                <Input
                  type="number"
                  placeholder="Contado..."
                  value={countedQuantities[product.id] ?? ""}
                  onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                />
              </div>
            </div>
          ))}
          <div className="mt-4">
            <Button onClick={handleInitialSubmit} disabled={!allProductsCounted}>
              Confirmar y Procesar Ajuste
            </Button>
          </div>
        </CardContent>
      </Card>

      <BaseModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Confirmar Diferencias"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleFinalSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Procesando..." : "Confirmar Ajuste Final"}
            </Button>
          </>
        }
      >
          {differences.map((d) => (
            <div key={d.productId} className="mb-4">
              <h3 className="font-bold">{d.name}</h3>
              <p>Esperado: {d.expected}, Contado: {d.counted}, Diferencia: <span className={d.diff > 0 ? "text-green-500" : "text-red-500"}>{d.diff}</span></p>
              {d.decomposition && (
                <div className="pl-4 mt-2">
                  <h4>Sugerencia de Venta:</h4>
                  {d.decomposition.map((item, index) => (
                    <div key={index} className="flex items-center">
                      <Input className="w-1/4 mr-2" type="number" defaultValue={item.quantity} />
                      <span>{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </BaseModal>
    </div>
  );
}
