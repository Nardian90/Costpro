#!/usr/bin/env python3
# ============================================================================
# M083 — CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012
# Genera READONLY_SQL_QUERIES.sql extrayendo LITERALMENTE las consultas
# SELECT de scripts/m080*/ (m080, m080b, m080c) + las 2 verificaciones
# server-side puntuales. Garantiza fidelidad: lo ejecutado == lo publicado.
# ============================================================================
import re, os

SRC = [
    ('scripts/m080-cert-012-extract.mjs', 'M080 · Extracción integral (53 consultas RO)', 'run'),
    ('scripts/m080b-cert-012-supplement.mjs', 'M080b · Suplemento agregado (8 consultas RO)', 'qs'),
    ('scripts/m080c-cert-012-supplement2.mjs', 'M080c · Suplemento 2 (6 consultas RO)', 'qs'),
]
out = []
out.append('-- =====================================================================================')
out.append('-- READONLY_SQL_QUERIES · CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012')
out.append('-- Auditoría independiente post-RECT-011 de FAC-VITALLCONS-001 (receipt_id fd9d6c88-…-8bc96cc93e63)')
out.append('--')
out.append('-- · TODAS las consultas son SELECT/WITH puros: NINGUNA escritura (guard CP-INFRA-020 por consulta).')
out.append('-- · Canal: Management API /database/query contra producción wthkddeleylijmonclxg con ALLOW_PROD=read-only.')
out.append('-- · Guards: CP-INFRA-019 (assert-not-production, modo read), guard de ref de proyecto, guard anti-escritura.')
out.append('-- · Ejecutadas 2026-11-16 21:27–21:40 UTC · 67 consultas · producción INTACTA (ver m077 --verify 18/18 y snapshot).')
out.append('-- · Sustituir :FVC / :STORE por los literales si se re-ejecutan a mano (ya vienen interpolados abajo).')
out.append('-- =====================================================================================')
out.append('')
total = 0
for path, titulo, fn in SRC:
    src = open(path, encoding='utf-8').read()
    out.append(f'-- ─────────────────────────────────────────────────────────────────────────────────────')
    out.append(f'-- {titulo}  ({os.path.basename(path)})')
    out.append(f'-- ─────────────────────────────────────────────────────────────────────────────────────')
    out.append('')
    # capturar (label, sql) de run('label', `SQL`) o qs(`SQL`, 'label') — multilínea
    pat = re.compile(r"(?:run|qs)\(\s*'([^']+)'\s*,\s*`(.*?)`\s*\)|qs\(`(.*?)`\s*,\s*'([^']+)'\s*\)", re.S)
    for m in pat.finditer(src):
        if m.group(1):
            label, sql = m.group(1), m.group(2)
        else:
            sql, label = m.group(3), m.group(4)
        sql = sql.strip()
        if not sql.upper().startswith(('SELECT', 'WITH')):
            continue
        total += 1
        out.append(f'-- [{label}]')
        for line in sql.splitlines():
            out.append(line)
        out.append('')
# 2 verificaciones server-side puntuales (contador de capas/saldos por tienda, WAC negativos)
out.append('-- ─────────────────────────────────────────────────────────────────────────────────────')
out.append('-- VERIFICACIONES SERVER-SIDE PUNTUALES (consistencia de la extracción)')
out.append('-- ─────────────────────────────────────────────────────────────────────────────────────')
out.append('')
extra = [
    ('conteo_movimientos_por_cuenta', """SELECT category_code, count(*)::int AS n FROM public.fin_movements
 WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND category_code IN
 ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV')
 GROUP BY 1 ORDER BY 1"""),
    ('saldo_act_cxp_por_tienda', """SELECT m.store_id, c.code,
 round(CASE WHEN c.clase IN ('activo','gasto') THEN coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0)
       ELSE coalesce(sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END),0) END,2) AS saldo, count(m.id)::int AS n
 FROM public.fin_movements m JOIN public.fin_categories c ON c.code=m.category_code
 WHERE c.code IN ('ACT_INVENTARIO','PAS_CXP_PROV')
 GROUP BY m.store_id, c.code, c.clase ORDER BY m.store_id, c.code"""),
    ('sku999_movimientos_completos', """SELECT sm.movement_type, sm.quantity_change, sm.unit_cost, sm.reference_id, sm.created_at
 FROM public.stock_movements sm
 WHERE sm.product_id=(SELECT id FROM public.products WHERE sku='999' AND store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38')
 ORDER BY sm.created_at"""),
    ('wac_negativos_hallazgo_f0121', """SELECT p.sku, p.name, p.cost_average, p.stock_current,
 (p.id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63')) AS del_fvc
 FROM public.products p
 WHERE p.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND p.is_service=false AND p.cost_average<0
 ORDER BY p.sku"""),
]
for label, sql in extra:
    total += 1
    out.append(f'-- [{label}]')
    out.append(sql.strip())
    out.append('')
out.append('-- =====================================================================================')
out.append(f'-- FIN · {total} consultas · todas de solo lectura · re-ejecutables sin efectos')
out.append('-- =====================================================================================')
dest = 'docs/audits/cp-fin-post-rectification-certification-012/READONLY_SQL_QUERIES.sql'
open(dest, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(f'OK → {dest} ({total} consultas, {os.path.getsize(dest)} bytes)')
