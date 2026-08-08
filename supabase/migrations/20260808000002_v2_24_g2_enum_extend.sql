-- ══════════════════════════════════════════════════════════════════════
-- F-20 G2 — Enum completo: añadir 'sent' y 'partial' a purchase_status_enum
-- Hallazgos cubiertos: Alto #4 (faltan sent, partial)
-- ══════════════════════════════════════════════════════════════════════
-- IMPORTANTE: ALTER TYPE ... ADD VALUE es transaccional en PG 13+.
-- Supabase usa PG 17.6 (verificado). Statements sueltos por defensa.

-- Añadir 'sent' después de 'draft'
ALTER TYPE public.purchase_status_enum ADD VALUE IF NOT EXISTS 'sent' AFTER 'draft';

-- Añadir 'partial' después de 'sent'
ALTER TYPE public.purchase_status_enum ADD VALUE IF NOT EXISTS 'partial' AFTER 'sent';

-- Verificación post-migración (ejecutar manualmente):
-- SELECT unnest(enum_range(NULL::purchase_status_enum));
-- Resultado esperado: draft, sent, partial, received, cancelled

-- ═══ DOWN ═══
-- NO se puede hacer ALTER TYPE ... DROP VALUE en PostgreSQL.
-- Para revertir, hay que recrear el tipo (ver plan rollback del PDF §14).
