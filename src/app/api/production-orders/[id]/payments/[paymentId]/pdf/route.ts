/**
 * GET /api/production-orders/[id]/payments/[paymentId]/pdf
 *
 * Genera un PDF de Comprobante de Cobro (tiquet compacto 80mm) para:
 *   - Anticipo (advance)
 *   - Pago parcial (partial)
 *   - Liquidación (settlement)
 *
 * El comprobante incluye:
 *   - Branding de la tienda (nombre, tagline, dirección, teléfono)
 *   - Tipo de comprobante (ANTICIPO / PAGO PARCIAL / LIQUIDACIÓN)
 *   - Número de comprobante y OT de referencia
 *   - Datos del cliente (nombre, teléfono)
 *   - Monto recibido destacado + método de pago
 *   - Estado de cuenta de la OT (contratado, total pagado, saldo pendiente)
 *   - Notas (si hay)
 *   - Línea de firma del cajero
 *
 * Requiere autenticación (withAuth).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { generateComprobanteCobroPDF } from '@/lib/export/comprobante-cobro-pdf-generator';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // Extraer IDs de la URL: /api/production-orders/[id]/payments/[paymentId]/pdf
    const parts = req.nextUrl.pathname.split('/');
    const orderId = parts[parts.length - 4] || '';
    const paymentId = parts[parts.length - 2] || '';

    if (!orderId || !paymentId) {
      return NextResponse.json({ error: 'Order ID y Payment ID requeridos' }, { status: 400 });
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

    // 2. Verificar acceso a la store
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

    // 3. Cargar el pago específico
    const { data: payment, error: paymentError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('id', paymentId)
      .eq('ref_id', orderId) // defense-in-depth: el pago pertenece a esta OT
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Pago no encontrado' },
        { status: 404 }
      );
    }

    // 4. Cargar datos de la store
    const { data: store } = await supabase
      .from('stores')
      .select('id, name, store_tagline, address, phone, email')
      .eq('id', order.store_id)
      .single();

    // 5. Determinar tipo de pago desde las notas o reference
    let paymentType: 'advance' | 'partial' | 'settlement' = 'partial';
    const notesLower = (payment.notes || '').toLowerCase();
    const refLower = (payment.reference || '').toLowerCase();
    if (notesLower.includes('anticipo') || refLower.includes('anticipo')) {
      paymentType = 'advance';
    } else if (notesLower.includes('liquidacion') || notesLower.includes('liquidación') || refLower.includes('liquidacion') || refLower.includes('liquidación') || notesLower.includes('settlement')) {
      paymentType = 'settlement';
    } else {
      paymentType = 'partial';
    }

    // 6. Generar número de comprobante
    const comprobanteNumber = `REC-${new Date().getFullYear()}-${paymentId.slice(0, 8).toUpperCase()}`;

    // 7. Construir objeto ComprobanteCobroData
    const comprobanteData = {
      comprobante_number: comprobanteNumber,
      payment_type: paymentType,
      amount: Number(payment.amount || 0),
      currency: payment.currency || 'CUP',
      payment_method: payment.payment_method || 'cash',
      payment_date: payment.payment_date || new Date().toISOString(),
      reference: payment.reference || '',
      notes: payment.notes || '',

      order_number: order.order_number,
      order_id: orderId,
      customer_name: order.customer_name || '—',
      customer_phone: order.customer_phone || '',
      description: order.description || '',

      budget_total: Number(order.budget_total || 0),
      paid_amount: Number(order.paid_amount || 0),
      budget_currency: order.budget_currency || 'CUP',

      store_name: store?.name || 'Tienda',
      store_tagline: store?.store_tagline || '',
      store_phone: store?.phone || '',
      store_address: store?.address || '',
    };

    // 8. Generar PDF
    const pdfBytes = generateComprobanteCobroPDF(comprobanteData);
    const pdfBuffer = Buffer.from(pdfBytes);

    // 9. Devolver como respuesta
    const filename = `Comprobante_${comprobanteNumber}_${order.order_number}.pdf`;
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
    console.error('[Comprobante-PDF] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error generando comprobante' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
