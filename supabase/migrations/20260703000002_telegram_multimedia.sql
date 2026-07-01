-- =====================================================================
-- Migration: Telegram Multimedia — Fase T9
-- Fecha: 2026-07-03
--
-- Agrega columnas para soporte de multimedia en telegram_messages.
-- Telegram envía un file_id en el Update; descargamos el archivo
-- on-demand via getFile + downloadFile (no almacenamos el binario en BD).
--
-- Tipos soportados (media_type):
--   photo       — foto comprimida por Telegram (3 tamaños)
--   document    — cualquier archivo (PDF, foto sin compresión, etc.)
--   voice       — mensaje de voz .ogg
--   audio       — archivo de audio .mp3
--   video       — video .mp4
--   video_note  — mensaje circular de video
--   sticker     — sticker .webp o .tgs (animado)
--   animation   — GIF
--   contact     — vCard de contacto
--   location    — coordenadas geo
--   venue       — lugar con dirección
--   dice        — dado animado
--
-- Para T10 (VLM) y T11 (ASR) se agregarán columnas adicionales.
-- =====================================================================

ALTER TABLE public.telegram_messages
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS file_id TEXT,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS caption TEXT;

-- Índice para filtrar mensajes con multimedia
CREATE INDEX IF NOT EXISTS idx_telegram_messages_media
  ON public.telegram_messages(store_id, media_type)
  WHERE media_type IS NOT NULL;

COMMENT ON COLUMN public.telegram_messages.media_type IS 'Tipo de multimedia: photo, document, voice, audio, video, video_note, sticker, animation, contact, location, venue, dice. NULL = mensaje de texto.';
COMMENT ON COLUMN public.telegram_messages.file_id IS 'file_id de Telegram para descargar el archivo via getFile API. NULL para texto.';
COMMENT ON COLUMN public.telegram_messages.file_path IS 'file_path cacheado de getFile (no incluye el base URL).';
COMMENT ON COLUMN public.telegram_messages.caption IS 'Caption de fotos/documentos/videos. Para texto plano, el caption se guarda también en content.';
