SELECT schema, version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 15;
