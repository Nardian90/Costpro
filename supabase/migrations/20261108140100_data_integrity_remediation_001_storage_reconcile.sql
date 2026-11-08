-- ═══════════════════════════════════════════════════════════════════════════
-- DATA-INTEGRITY-REMEDIATION-001 — PROBLEMA B: corrección del diagnóstico de
-- Storage (el hallazgo original de "31 objetos inexistentes" era un FALSO
-- POSITIVO del descargador del respaldo) + verificación completa del estado
-- ═══════════════════════════════════════════════════════════════════════════
-- HISTORIA DEL HALLAZGO (evidencia completa en docs/audits/DATA-INTEGRITY-
-- REMEDIATION-001/02_FORENSIC_ANALYSIS.md §D):
--   · La misión de respaldo (RESPALDO-COSTPRODB, manifiesto storage-
--     20261108-0056.json) reportó 31 "objetos fantasma" en el bucket stores:
--     filas de storage.objects sin archivo físico (NoSuchKey).
--   · La FASE I de esta misión re-verificó 31 rutas y reprodujo el NoSuchKey…
--     con el MISMO método defectuoso (ver abajo), pareciendo confirmarlo.
--   · La verificación con rutas COMPLETAS contra el origen (GET autenticado,
--     2026-11-08 ~02:20 UTC) demostró que LOS 31 ARCHIVOS EXISTEN FÍSICAMENTE
--     con sus bytes exactos de metadato. El Problema B tal como fue reportado
--     NO EXISTE.
--
-- CAUSA RAIZ DEL FALSO POSITIVO (bug en scripts/respaldo-costpro/
-- 12-descargar-storage.py, línea de construcción de URL):
--   El listado recursivo desciende por carpetas (store-banners/, store-logos/,
--   …). La API /object/list devuelve `name` RELATIVO al prefijo solicitado.
--   Al descargar, el script construía /object/{bucket}/{name} OMITIENDO el
--   prefijo de carpeta acumulado → pedía /object/stores/277fc216-….jpg en
--   vez de /object/stores/store-banners/277fc216-….jpg → NoSuchKey →
--   "fantasma". Solo los buckets con objetos en raíz (product-images, salva)
--   quedaron bien respaldados; TODO objeto anidado (31 de stores + 122 de
--   reports) quedó fuera del respaldo y mal clasificado.
--
-- TRATAMIENTO (corrección R-corr):
--   · NINGUNA fila de storage.objects se modifica ni elimina: los 31 objetos
--     existen y todas las referencias vivas de stores resuelven (verificado
--     GET 200 con bytes exactos para las 10 referencias activas:
--     logo/banner/firma/sello/promos de ENERVIDA y COSTPRO (Prueba)).
--   · Esta migración deja constancia en audit_logs de la corrección del
--     diagnóstico (trazabilidad de la auditoría: un hallazgo inicial
--     equivocado que se corrige con evidencia, no se perpetúa).
--   · El hueco REAL detectado al re-verificar: el RESPALDO 20261108-0056 no
--     contiene los 153 objetos anidados (31 stores + 122 reports). Eso es un
--     defecto del proceso de respaldo (corregido en el descargador + addendum
--     con re-descarga y verificación), NO un defecto de los datos de
--     producción.
--   · Durante la fase de "recuperación" R1 (antes del descubrimiento) se
--     re-subieron 4 imágenes (banner + 3 promos de ENERVIDA) con copias
--     byte-exacta del repositorio a sus MISMAS rutas: PUT idempotente sobre
--     objetos existentes, GET verificado 200 y SHA-256 idéntico al original
--     del repo. Sin efecto neto sobre los datos (mismo contenido, misma ruta,
--     mismo tamaño registrado en metadata). Queda registrado como la operación
--     de escritura nº 1-4 de esta misión.
--
-- PREVENCIÓN (migración C, 20261108140200): reconcile_storage_metadata()
-- queda como detector PERMANENTE de fantasmas reales: filas sin referencia
-- viva y referencias vivas sin fila. La verificación física se realiza por
-- HEAD a /object/public (como un navegador) — NUNCA construyendo la URL del
-- objeto con `name` relativo a un prefijo (el bug original).
--
-- IDEMPOTENTE: solo auditoría con NOT EXISTS; cero DML sobre storage.objects.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_stores_rows int;
  v_con_referencia int;
  v_sin_referencia int;
BEGIN
  SELECT count(*) INTO v_stores_rows FROM storage.objects WHERE bucket_id = 'stores';
  SELECT count(*) INTO v_con_referencia
    FROM storage.objects o
    WHERE o.bucket_id = 'stores'
      AND EXISTS (SELECT 1 FROM public.stores s
                   WHERE s.logo_url      LIKE '%' || o.name || '%'
                      OR s.banner_url    LIKE '%' || o.name || '%'
                      OR s.signature_url LIKE '%' || o.name || '%'
                      OR s.stamp_url     LIKE '%' || o.name || '%'
                      OR s.promo_images::text LIKE '%' || o.name || '%');
  v_sin_referencia := v_stores_rows - v_con_referencia;

  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, metadata)
  SELECT 'system', NULL, 'DATA-INTEGRITY-REMEDIATION-001-correccion-diagnostico',
    jsonb_build_object(
      'tabla', 'storage.objects',
      'diagnostico_original', '31 objetos fantasma en bucket stores (manifiesto storage-20261108-0056)',
      'diagnostico_corregido', 'FALSO POSITIVO: los 31 archivos existen fisicamente con bytes exactos (GET autenticado 200, verificacion 2026-11-08 02:20 UTC)',
      'causa_raiz', 'Bug en descargador del respaldo: URL /object/{bucket}/{name} omitia el prefijo de carpeta al recursar (name relativo al prefijo del list) -> NoSuchKey',
      'alcance_del_bug', '153 objetos anidados fuera del respaldo (31 stores + 122 reports/cost_sheet); corregido el descargador + addendum re-descargado y verificado',
      'escrituras_produccion_durante_mision', to_jsonb(ARRAY[
        'PUT store-banners/enervida-banner-1783144848029.png (copia byte-exacta, misma ruta, objeto ya existente)',
        'PUT store-promo-images/enervida-promo1-v2-1783146667184.png (idem)',
        'PUT store-promo-images/enervida-promo2-v2-1783146667184.png (idem)',
        'PUT store-promo-images/enervida-promo3-1783144851443.png (idem)']),
      'filas_bucket_stores', v_stores_rows,
      'filas_con_referencia_viva', v_con_referencia,
      'accion_sobre_datos', 'NINGUNA: no se modifica ni elimina ninguna fila de storage.objects'
    ),
    jsonb_build_object('mission', 'DATA-INTEGRITY-REMEDIATION-001', 'fase', 'correccion-B')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.metadata ? 'mission' AND a.metadata->>'mission' = 'DATA-INTEGRITY-REMEDIATION-001'
      AND a.action = 'DATA-INTEGRITY-REMEDIATION-001-correccion-diagnostico');

  RAISE NOTICE 'correccion B: bucket stores=% filas, % con referencia viva, % sin referencia (NINGUNA se modifica)',
    v_stores_rows, v_con_referencia, v_sin_referencia;
END $$;

-- Verificación en línea: el bucket debe quedar EXACTAMENTE como estaba.
SELECT 'migration_applied' AS status,
       (SELECT count(*) FROM storage.objects WHERE bucket_id = 'stores') AS filas_stores_inalteradas,
       (SELECT count(*) FROM public.stores s
          WHERE s.logo_url IS NOT NULL OR s.banner_url IS NOT NULL) AS tiendas_con_imagenes;
