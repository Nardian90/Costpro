/**
 * GET /api/production-orders/[id]/pdf
 *
 * Genera un PDF de la Orden de Trabajo (OT) con:
 *  - Header con branding de la tienda (logo placeholder + nombre + tagline)
 *  - Datos del cliente (nombre, CI, teléfono, dirección)
 *  - Información del contrato (contratado, anticipo, pagado, fechas)
 *  - Tabla de materiales (Cod, Descripción, UM, Cantidad, Precio, Importe)
 *  - Total
 *  - Líneas de firma (Cliente / Responsable)
 *
 * Requiere autenticación (withAuth).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { generateOTPDF } from '@/lib/export/ot-pdf-generator';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const orderId = req.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID requerido' }, { status: 400 });
    }

    const supabase = getSupabaseForSession(session);

    // 1. Cargar la OT
    const { data: order, error: orderError } = await supabase
      .from('production_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: orderError?.message || 'Orden de trabajo no encontrada' },
        { status: 404 }
      );
    }

    // 2. Verificar acceso a la store (defense-in-depth)
    const { data: membership } = await supabase
      .from('user_store_memberships')
      .select('id')
      .eq('store_id', order.store_id)
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .maybeSingle();

    const isAdmin = session.user.role === 'admin';
    if (!membership && !isAdmin) {
      return NextResponse.json(
        { error: 'No autorizado para esta OT' },
        { status: 403 }
      );
    }

    // 3. Cargar items con productos
    const { data: items, error: itemsError } = await supabase
      .from('production_order_items')
      .select(`
        *,
        products (
          id,
          name,
          sku,
          unit_of_measure
        )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (itemsError) {
      console.error('[OT-PDF] Error cargando items:', itemsError);
    }

    // 4. Cargar datos de la store (branding)
    const { data: store } = await supabase
      .from('stores')
      .select('id, name, store_tagline, address, phone, email, logo_url')
      .eq('id', order.store_id)
      .single();

    // 5. Cargar pagos (fechas de pago/liquidación)
    const { data: payments } = await supabase
      .from('payment_transactions')
      .select('amount, payment_date, currency, method, ref_type')
      .eq('ref_type', 'production_order')
      .eq('ref_id', orderId)
      .order('payment_date', { ascending: true });

    const fechaPrimerPago = payments && payments.length > 0 ? payments[0].payment_date : null;
    const fechaUltimoPago = payments && payments.length > 0 ? payments[payments.length - 1].payment_date : null;

    // 6. Construir objeto OTData
    // V2.12.35: incluir actual_qty, exceso, notas, supervisor
    const otData = {
      order_number: order.order_number,
      order_date: order.order_date,
      customer_name: order.customer_name || '—',
      customer_ci: order.customer_ci || '—',
      customer_phone: order.customer_phone || '—',
      customer_address: order.customer_address || '—',
      budget_total: Number(order.budget_total || 0),
      budget_currency: order.budget_currency || 'CUP',
      advance_amount: Number(order.advance_amount || 0),
      advance_currency: order.advance_currency || order.budget_currency || 'CUP',
      paid_amount: Number(order.paid_amount || 0),
      payment_status: order.payment_status || '',
      description: order.description || '',
      status: order.status,
      closed_at: order.closed_at,
      paid_at: fechaUltimoPago || order.paid_at,
      notas: order.notes || '',
      supervisor_name: 'PEDRO INFANTE', // TODO: hacer dinámico desde user_store_memberships
      items: (items || []).map((it: any) => ({
        sku: it.products?.sku || it.products?.name || '',
        name: it.products?.name || it.notes || 'Material',
        unit_of_measure: it.products?.unit_of_measure || 'U',
        budgeted_qty: Number(it.budgeted_qty || 0),
        budgeted_unit_cost: Number(it.budgeted_unit_cost || 0),
        actual_qty: it.actual_qty !== null ? Number(it.actual_qty) : undefined,
        exceso_qty: Number(it.exceso_qty || 0),
        exceso_importe: Number(it.exceso_importe || 0),
        exceso_moneda: it.exceso_moneda || '',
        facturar_exceso: it.facturar_exceso || false,
      })),
      exceso_total: (items || []).reduce((sum: number, it: any) => sum + Number(it.exceso_importe || 0), 0),
      exceso_moneda: 'USD',
      store_name: store?.name || 'Tienda',
      store_tagline: store?.store_tagline || '',
      store_address: store?.address || '',
      store_phone: store?.phone || '',
      store_email: store?.email || '',
      store_logo_url: store?.logo_url || '',
    };

    // 7. Generar PDF
    const pdfBytes = generateOTPDF(otData);
    const pdfBuffer = Buffer.from(pdfBytes);

    // 8. Devolver como respuesta con content-type application/pdf
    const filename = `OT_${order.order_number}_${new Date().toISOString().split('T')[0]}.pdf`;
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error: any) {
    console.error('[OT-PDF] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error generando PDF' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
