-- b4: multiple functions in one file, mixed body quoting (mandate case B4)
CREATE FUNCTION b4_a() RETURNS void LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.t_a VALUES (1); END; $$;
CREATE FUNCTION b4_b() RETURNS void LANGUAGE plpgsql AS $function$ BEGIN UPDATE public.t_b SET v = 1; END; $function$;
CREATE FUNCTION b4_c() RETURNS void LANGUAGE plpgsql AS $abc$ BEGIN PERFORM 1; END; $abc$;
CREATE FUNCTION b4_d() RETURNS void LANGUAGE sql AS 'SELECT 1';
