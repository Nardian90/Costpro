-- ════════════════════════════════════════════════════════════════════
-- F-02b: Tabla `user_preferences` (preferencias cross-device)
-- ════════════════════════════════════════════════════════════════════
-- RED FLAG F-02b: en F-02a (worklog IC-F02-CROSS-MODULE) se añadió un
-- selector de fuente de tasa en `CosteoDinamicoView` que persiste en
-- `localStorage` con key `costpro:costeo-dinamico:rate-source`. El
-- problema: localStorage es por-dispositivo. Si el usuario usa la app
-- desde su móvil y desde desktop, la preferencia NO se sincroniza.
--
-- Esta migración crea una tabla genérica `user_preferences` que permite
-- guardar cualquier preferencia por usuario, con un valor JSONB para
-- máxima flexibilidad. El hook `useUserPreferences` (cliente) hace la
-- capa de sync Supabase + fallback localStorage.
--
-- Esquema:
--   user_id          UUID → auth.users(id) ON DELETE CASCADE
--   preference_key   TEXT — ej. 'costeo-dinamico:rate-source'
--   preference_value JSONB — ej. '"BCC_seg3"' (string JSON válido)
--   updated_at       TIMESTAMPTZ — default now()
--   PK (user_id, preference_key) — una preferencia por usuario
--
-- RLS: cada usuario solo puede leer/escribir SUS preferencias.
--
-- Nota: el valor se guarda como JSONB para soportar strings, números,
-- objetos, arrays, etc. Para una preferencia string como
-- 'costeo-dinamico:rate-source' = 'BCC_seg3', se guarda como
-- `"BCC_seg3"` (JSON string válido). El hook lo serializa/deserializa
-- con JSON.stringify/JSON.parse automáticamente.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, preference_key)
);

-- RLS: cada usuario solo puede leer/escribir sus propias preferencias.
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences" ON user_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can write own preferences" ON user_preferences;
CREATE POLICY "Users can write own preferences" ON user_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Índice secundario para consultas por usuario (la PK ya indexa por
-- (user_id, preference_key), pero este índice simple puede ser útil
-- para queries que filtran solo por user_id sin key).
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
  ON user_preferences(user_id);

-- updated_at automático en cada UPDATE. Si ya existe el trigger, lo
-- reemplazamos (idempotente).
CREATE OR REPLACE FUNCTION fn_user_preferences_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_preferences_set_updated_at ON user_preferences;
CREATE TRIGGER trg_user_preferences_set_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION fn_user_preferences_set_updated_at();

COMMENT ON TABLE user_preferences IS
  'F-02b: Preferencias de usuario cross-device. Ej: fuente de tasa preferida en CosteoDinamicoView (preference_key=''costeo-dinamico:rate-source''). Sincroniza móvil ↔ desktop del mismo usuario. RLS: cada usuario solo accede a sus filas.';
