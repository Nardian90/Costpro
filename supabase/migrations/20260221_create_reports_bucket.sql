
-- Migration: Create Reports Storage Bucket
-- Created at: 2026-02-21

-- Create the 'reports' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
SELECT 'reports', 'reports', true
WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'reports'
);

-- Set up RLS for the 'reports' bucket
-- Note: These policies assume the 'storage.objects' table exists and RLS is enabled.
-- Supabase handles this by default for the storage schema.

-- 1. Allow public read access to the reports bucket
-- This is necessary so the generated PDF URLs can be opened by users.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Public Access to Reports'
        AND tablename = 'objects'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Public Access to Reports"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'reports');
    END IF;
END $$;

-- 2. Allow authenticated users to upload to reports bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Authenticated Upload to Reports'
        AND tablename = 'objects'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Authenticated Upload to Reports"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'reports' AND auth.role() = 'authenticated');
    END IF;
END $$;

-- 3. Allow authenticated users to update/delete their own uploads if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Authenticated Delete Own Reports'
        AND tablename = 'objects'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Authenticated Delete Own Reports"
        ON storage.objects FOR DELETE
        USING (bucket_id = 'reports' AND auth.role() = 'authenticated');
    END IF;
END $$;
