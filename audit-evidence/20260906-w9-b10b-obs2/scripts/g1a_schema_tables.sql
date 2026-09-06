-- GATE 1a · Reconocimiento de esquema (READ ONLY)
-- 1) Todas las tablas base del esquema public
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
