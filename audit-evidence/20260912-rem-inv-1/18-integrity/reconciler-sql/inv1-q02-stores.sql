-- Fase 1: tiendas activas (identidad para zero-touch)
SELECT id, name, slug, is_active, tenant_id FROM stores ORDER BY created_at;
