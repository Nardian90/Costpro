"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import {
  type CatalogProduct,
  type BrandConfig,
  type TemplateRenderer,
  type TemplateConfig,
  TEMPLATE_CONFIGS,
} from "@/components/views/terminal/views/pos/catalog-templates/types";
import { organizeProducts, buildBrandConfig } from "@/components/views/terminal/views/pos/catalog-templates/shared";
import {
  renderWhatsAppTemplate,
  renderInstagramTemplate,
  renderPriceListTemplate,
  renderElegantCatalogTemplate,
} from "@/components/views/terminal/views/pos/catalog-templates";
import type { Product } from "@/types";

// ── Registry ─────────────────────────────────────────────────

const RENDERERS: Record<string, TemplateRenderer> = {
  whatsapp: renderWhatsAppTemplate,
  instagram: renderInstagramTemplate,
  "price-list": renderPriceListTemplate,
  elegant: renderElegantCatalogTemplate,
};

// ── Mappers ──────────────────────────────────────────────────

function toCatalogProduct(p: Product): CatalogProduct {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? undefined,
    price: p.price || 0,
    cost_price: p.cost_price ?? undefined,
    stock_current: p.stock_current ?? undefined,
    public_image_url: p.public_image_url ?? undefined,
    image_url: p.image_url ?? undefined,
    category: p.category ?? undefined,
    description: p.description ?? undefined,
    unit_of_measure: p.unit_of_measure ?? undefined,
  };
}

// ── Hook ─────────────────────────────────────────────────────

export function useCatalogExport(products: Product[]) {
  const isExporting = useCallback(
    (templateId: string): boolean => {
      return false;
    },
    [],
  );

  const exportCatalog = useCallback(
    async (templateId: string, storeName: string, themeColor?: [number, number, number], avatarPath?: string) => {
      const config = TEMPLATE_CONFIGS.find((t) => t.id === templateId);
      if (!config) {
        toast.error("Plantilla no encontrada");
        return;
      }

      const renderer = RENDERERS[templateId];
      if (!renderer) {
        toast.error("Renderizador no disponible para esta plantilla");
        return;
      }

      const catalogProducts = products.map(toCatalogProduct);
      if (catalogProducts.length === 0) {
        toast.error("No hay productos para exportar");
        return;
      }

      const brand = buildBrandConfig(storeName);

      // Override primary color with theme picker selection
      if (themeColor) {
        brand.primaryColor = themeColor;
      }
      // Set avatar path for cover branding
      if (avatarPath) {
        brand.avatar = avatarPath;
      }

      const organized = organizeProducts(catalogProducts);

      if (organized.total === 0) {
        toast.error("No hay productos para exportar");
        return;
      }

      const toastId = toast.loading(
        `Generando ${config.name}... (${organized.withImages.length} con imagen)`,
      );

      try {
        await renderer(catalogProducts, brand);
        toast.success(`${config.name} generado correctamente`, { id: toastId });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error al generar el catalogo";
        toast.error(message, { id: toastId });
      }
    },
    [products],
  );

  const organizedProducts = organizeProducts(
    products.map(toCatalogProduct),
  );

  return {
    exportCatalog,
    organizedProducts,
    templates: TEMPLATE_CONFIGS,
  };
}
