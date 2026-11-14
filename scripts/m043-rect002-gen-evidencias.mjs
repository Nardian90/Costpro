// ============================================================================
// CP-FIN-VALUATION-CORRECTION-002 — ENSAMBLADO DE EVIDENCIAS JSON
// EVIDENCIA_RECTIFICACION_SKU111_112.json (reproducible) + EVIDENCIA_E2E_AISLADA.json
// ============================================================================
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
const D = '/home/z/my-project/scripts/out/';
const DL = '/home/z/my-project/download/';

const faseA = JSON.parse(fs.readFileSync(D + 'rect002-faseA-verificacion.json', 'utf8'));
const faseD = JSON.parse(fs.readFileSync(D + 'rect002-faseD-analisis.json', 'utf8'));
const e2e = JSON.parse(fs.readFileSync(D + 'rect002-e2e-prototipo.json', 'utf8'));
const auditPrecios = JSON.parse(fs.readFileSync(D + 'rect002-faseA2-audit-precios.json', 'utf8'));

// ── Evidencia principal reproducible ────────────────────────────────────────
const evidencia = {
  mision: 'CP-FIN-VALUATION-CORRECTION-002',
  titulo: 'Rectificación de SKU 111 y SKU 112 — precios de venta interpretados como costos USD',
  generado: new Date().toISOString(),
  metodo: 'REST PostgREST (service_role) read-only sobre producción + recomputo local; producción INTACTA',
  declaracion_propietario: {
    fecha: '2026-11-15',
    contenido: [
      'SKU 111 (Grapas plásticas con clavo de acero): 2.500 es PRECIO DE VENTA en CUP, no costo USD. Costo real: 1 CUP/u.',
      'SKU 112 (Grapas metálicas 3/4 con tornillo roscante): 1.000 es PRECIO DE VENTA en CUP, no costo USD. Costo real: 1 CUP/u.',
      'No multiplicar por 680. La tasa 680 se mantiene para las demás líneas USD auténticas.',
      'La diferencia 151.299.851 CUP es clasificación errónea de precio de venta y moneda, NO pérdida económica confirmada.',
    ],
  },
  corroboracion_independiente: {
    gate16_wac_log: faseA.wac_change_log_111_112,
    auditoria_precios: auditPrecios.audit_products_111_112.filter((a) => a.action === 'UPDATE_PRODUCT'),
    maestro_cost_price_cero_101_lineas: true,
    patron_uc_igual_precio: '74/101 líneas (incl. decimales); fuente: receipt_items vs products (fase A)',
    pr2_backup: '0 líneas de SKU 111/112 — la FVC (2026-08-11) es posterior al backup (2026-08-09/10)',
  },
  verificacion_aritmetica: faseA.verificacion_aritmetica,
  recomputo_corregido: faseA.recomputo_corregido,
  reconciliacion_total: faseD.reconciliacion_total,
  doble_conversion: faseD.doble_conversion,
  descomposicion_impacto: faseD.descomposicion_impacto,
  kardex_sku_111: faseD.kardex_sku_111,
  kardex_sku_112: faseD.kardex_sku_112,
  clasificacion_resumen: faseD.resumen_clasificacion,
  exposicion_potencial: faseD.exposicion_potencial,
  clasificacion_lineas: faseD.clasificacion_lineas,
  hashes_faseA: faseA.hashes,
  hashes_internos: {},
};
evidencia.hashes_internos = {
  kardex_sku_111: sha256(evidencia.kardex_sku_111),
  kardex_sku_112: sha256(evidencia.kardex_sku_112),
  reconciliacion_total: sha256(evidencia.reconciliacion_total),
  descomposicion_impacto: sha256(evidencia.descomposicion_impacto),
  clasificacion_lineas: sha256(evidencia.clasificacion_lineas),
};
fs.writeFileSync(DL + 'EVIDENCIA_RECTIFICACION_SKU111_112.json', JSON.stringify(evidencia, null, 1));
console.log('OK: EVIDENCIA_RECTIFICACION_SKU111_112.json', fs.statSync(DL + 'EVIDENCIA_RECTIFICACION_SKU111_112.json').size, 'bytes');

// ── Evidencia E2E aislada ───────────────────────────────────────────────────
const e2eOut = {
  mision: 'CP-FIN-VALUATION-CORRECTION-002',
  titulo: 'Prototipo E2E aislado de la rectificación de SKU 111/112 (FAC-VITALLCONS-001)',
  generado: new Date().toISOString(),
  ...e2e,
  contexto: {
    bd_aislada: 'lguovmvrozxgssupkwpf (CostproE2E) — PROHIBIDA en producción; sentinela e2e_is_isolated_db()=true verificado por REST y SQL',
    canal_escritura: 'pooler IPv4 aws-0-us-east-1.pooler.supabase.com:6543 (transacción atómica) + REST service_role (seed/validaciones)',
    alcance_replica: 'tienda réplica + 2 productos (precios de venta intactos) + recepción defectuosa (2 líneas USD@680) + 21 movimientos del kardex real + 3 asientos históricos (reconocimiento 151,3M + COGS 5 + vales 88)',
    procedimiento: '7 pasos del procedimiento canónico (PROPUESTA_RECTIFICACION_CP_FIN_WAD.md §3) en UNA transacción con SET LOCAL app.allow_receipt_item_edit=on (escape hatch M021)',
    nota_created_at: 'created_at de movimientos desempatado (±minutos) para determinismo del trigger sync_product_stock (ORDER BY movement_date DESC, created_at DESC LIMIT 1); movement_date conserva la fecha económica real; hallazgo técnico documentado para backlog',
    produccion: 'INTACTA — ninguna escritura en wthkddeleylijmonclxg durante toda la misión',
  },
};
fs.writeFileSync(DL + 'EVIDENCIA_E2E_AISLADA.json', JSON.stringify(e2eOut, null, 1));
console.log('OK: EVIDENCIA_E2E_AISLADA.json', fs.statSync(DL + 'EVIDENCIA_E2E_AISLADA.json').size, 'bytes');
console.log('Veredicto E2E:', e2eOut.resumen.veredicto);
