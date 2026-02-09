-- Migration: Create Roles Table
-- TAREA 2: Tabla de roles flexible con permisos JSONB

BEGIN;

CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{"views": []}',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert standard roles
INSERT INTO public.roles (name, permissions, is_default)
VALUES
    ('Admin', '{"views": ["Dashboard", "Inventory", "POS", "Reports", "Users", "Costs", "Settings"], "all": true}', false),
    ('Encargado', '{"views": ["Dashboard", "Inventory", "POS", "Reports", "Users", "Costs"], "all": false}', false),
    ('Cajero', '{"views": ["POS"], "all": false}', false),
    ('Almacenero', '{"views": ["Inventory"], "all": false}', false),
    ('UserCosto', '{"views": ["Costs"], "all": false}', true)
ON CONFLICT (name) DO NOTHING;

-- Add role_id to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id);

-- Update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_roles_updated_at ON public.roles;
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON public.roles
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();

COMMIT;
