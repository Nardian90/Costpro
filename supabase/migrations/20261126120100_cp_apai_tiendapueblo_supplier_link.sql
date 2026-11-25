-- ============================================================================
-- CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — Migración 2/2.
--
-- FASE 6 — Saneamiento del quirk de identificación «Tienda Pueblo» /
-- «TiendaPueblo» (auditoría forense previa, Cuentas por Pagar por proveedor).
--
-- RESULTADO DE LA INVESTIGACIÓN (2026-11-26, solo lectura):
--   · NO existen dos registros de proveedor: hay UN proveedor local canónico
--     «Tienda Pueblo» (suppliers, creado 2026-10-26 15:03 UTC) y ningún
--     tercero maestro equivalente.
--   · El quirk es de DIGITACIÓN en UN documento: el servicio
--     SRV-20261026-00087 (ref. C26102026, $400, tipo Comisión, activo y
--     pagado) fue registrado con el texto libre «TiendaPueblo» (sin espacio,
--     supplier_id NULL) — 20 servicios y 5 recepciones usan la forma
--     canónica «Tienda Pueblo».
--   · Evidencia de misma entidad: nombre normalizado idéntico, mismo día de
--     alta del proveedor local, misma naturaleza operativa (comisiones).
--
-- CORRECCIÓN (misión §8.2 — vía gobernada; no existe RPC oficial de edición
-- del proveedor de un documento): normalizar el snapshot textual del
-- documento y vincularlo al proveedor local canónico (supplier_id). NO toca
-- importes, pagos, asientos ni estados. Trazabilidad: audit_logs
-- SR_SUPPLIER_NORMALIZED con valores antes/después.
--
-- Idempotente: si el documento ya está corregido (o no existe / no hay
-- proveedor canónico único) → no-op. En replays (BD aislada E2E) el
-- documento no existe → no-op exacto.
-- REVERSIBILIDAD: UPDATE inverso documentado en el expediente (valores
-- antes/después quedan en audit_logs y en este archivo).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_service record;
  v_canonical_id uuid;
  v_canonical_name text;
BEGIN
  -- 1) El documento con la variante (guards: número + referencia + texto exacto).
  SELECT id, store_id, service_number, reference_doc, supplier, supplier_id, status
    INTO v_service
    FROM public.received_services
   WHERE service_number = 'SRV-20261026-00087'
     AND reference_doc = 'C26102026'
     AND supplier = 'TiendaPueblo'
     AND supplier_id IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'CP-APAI tiendapueblo: documento ya corregido o inexistente — no-op';
    RETURN;
  END IF;

  -- 2) Proveedor local canónico de la MISMA tienda (unicidad exigida).
  SELECT id, name
    INTO v_canonical_id, v_canonical_name
    FROM public.suppliers
   WHERE store_id = v_service.store_id
     AND name = 'Tienda Pueblo'
     AND is_active = true;

  IF v_canonical_id IS NULL THEN
    RAISE NOTICE 'CP-APAI tiendapueblo: sin proveedor canónico «Tienda Pueblo» activo en la tienda % — pendiente de resolución manual (no se inventa identidad)', v_service.store_id;
    RETURN;
  END IF;

  -- 3) Verificar que no sea una entidad distinta: si existiera OTRO proveedor
  --    local con nombre normalizado igual en la misma tienda, detener (el
  --    canonical elegido debe ser inequívoco).
  IF (SELECT count(*) FROM public.suppliers
       WHERE store_id = v_service.store_id
         AND is_active = true
         AND lower(regexp_replace(name, '[^a-zA-Z0-9áéíóúñ]', '', 'g'))
             = lower(regexp_replace('Tienda Pueblo', '[^a-zA-Z0-9áéíóúñ]', '', 'g'))) > 1 THEN
    RAISE NOTICE 'CP-APAI tiendapueblo: ambigüedad de proveedores canónicos en la tienda % — pendiente de resolución manual', v_service.store_id;
    RETURN;
  END IF;

  -- 4) Corrección del snapshot textual + identidad estructurada.
  UPDATE public.received_services
     SET supplier = v_canonical_name,
         supplier_id = v_canonical_id,
         updated_at = now()
   WHERE id = v_service.id;

  -- 5) Trazabilidad de auditoría (misión §8.2: «registrar auditoría»).
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    NULL,
    v_service.store_id,
    'SR_SUPPLIER_NORMALIZED',
    'received_services',
    v_service.id,
    jsonb_build_object(
      'mission', 'CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001',
      'fase', 'FASE 6 — Tienda Pueblo / TiendaPueblo',
      'service_number', v_service.service_number,
      'reference_doc', v_service.reference_doc,
      'supplier_before', v_service.supplier,
      'supplier_after', v_canonical_name,
      'supplier_id_after', v_canonical_id,
      'supplier_id_before', v_service.supplier_id,
      'reason', 'Quirk de digitación: variante sin espacio del proveedor canónico; vinculación al registro local oficial',
      'reversible', true,
      'rollback_hint', 'UPDATE received_services SET supplier=''TiendaPueblo'', supplier_id=NULL WHERE id=<id> (valores antes/después en este registro)'
    )
  );

  RAISE NOTICE 'CP-APAI tiendapueblo: SRV-20261026-00087 normalizado a «%» (supplier_id %)', v_canonical_name, v_canonical_id;
END
$$;

COMMIT;
