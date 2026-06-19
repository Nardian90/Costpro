-- Add missing columns to stores table for Oferta Comercial integration
-- nit: Tax identification number (Número de Identificación Tributaria)
-- signature_url: Digital signature image for PDF documents
-- stamp_url: Company stamp/seal image for PDF documents
-- plantilla: Store template/theme for public storefront
-- latitude/longitude: GPS coordinates for Google Maps integration

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS nit TEXT,
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS stamp_url TEXT,
  ADD COLUMN IF NOT EXISTS plantilla TEXT DEFAULT 'construccion',
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Comments for documentation
COMMENT ON COLUMN stores.nit IS 'Número de Identificación Tributaria';
COMMENT ON COLUMN stores.signature_url IS 'URL de la imagen de firma digital para documentos PDF';
COMMENT ON COLUMN stores.stamp_url IS 'URL de la imagen del cuño/sello para documentos PDF';
COMMENT ON COLUMN stores.plantilla IS 'Plantilla de vitrina: construccion, minimalista, moderna, clasica';
COMMENT ON COLUMN stores.latitude IS 'Latitud GPS para integración con mapas';
COMMENT ON COLUMN stores.longitude IS 'Longitud GPS para integración con mapas';
