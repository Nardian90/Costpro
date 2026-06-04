/**
 * Catalog Export Template System — Type Definitions
 *
 * Supports multiple export formats (JPG, PDF) for different use cases:
 * social media, WhatsApp sharing, B2B price lists, and elegant catalogs.
 */

// ── Product ──────────────────────────────────────────────────

export interface CatalogProduct {
  id: string;
  name: string;
  sku?: string;
  price: number;
  cost_price?: number;
  stock_current?: number;
  public_image_url?: string;
  image_url?: string;
  category?: string;
  description?: string;
  unit_of_measure?: string;
}

// ── Brand ───────────────────────────────────────────────────

export interface BrandConfig {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  whatsapp?: string;
  website?: string;
  logo?: string;
  avatar?: string;
  primaryColor: [number, number, number]; // RGB tuple
  ownerName?: string;
}

// ── Template ────────────────────────────────────────────────

export type TemplateCategory = "social" | "whatsapp" | "price-list" | "catalog";
export type TemplateFormat = "jpg" | "pdf";

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  format: TemplateFormat;
  category: TemplateCategory;
  badge: string; // e.g. "JPG", "PDF", "JPG xN"
  productsPerPage: number;
  multiPage: boolean;
}

export const TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    id: "whatsapp",
    name: "Catalogo WhatsApp",
    description: "Pagina unica con grid de productos para compartir por WhatsApp o Telegram",
    icon: "MessageCircle",
    format: "jpg",
    category: "whatsapp",
    badge: "JPG",
    productsPerPage: 12,
    multiPage: false,
  },
  {
    id: "instagram",
    name: "Carrusel Instagram",
    description: "Slides individuales para publicar como carrusel en Instagram Feed",
    icon: "Camera",
    format: "jpg",
    category: "social",
    badge: "JPG xN",
    productsPerPage: 1,
    multiPage: true,
  },
  {
    id: "price-list",
    name: "Lista de Precios",
    description: "Tabla profesional con SKU, precios mayorista y unitario para B2B",
    icon: "Table",
    format: "pdf",
    category: "price-list",
    badge: "PDF",
    productsPerPage: 20,
    multiPage: true,
  },
  {
    id: "elegant",
    name: "Catalogo Elegante",
    description: "Catalogo premium estilo Home Depot con portada, 4 productos por fila, tags y QR",
    icon: "Sparkles",
    format: "pdf",
    category: "catalog",
    badge: "PDF",
    productsPerPage: 16,
    multiPage: true,
  },
];

// ── Renderer ────────────────────────────────────────────────

export type TemplateRenderer = (
  products: CatalogProduct[],
  brand: BrandConfig,
) => Promise<void>;

// ── Export result ──────────────────────────────────────────

export interface ExportResult {
  success: boolean;
  filename?: string;
  error?: string;
}
