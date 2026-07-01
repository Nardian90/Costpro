import autoTable from 'jspdf-autotable';
import { NextRequest, NextResponse } from 'next/server';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { ofertaPdfExportSchema, zodError } from '@/validation/api-schemas';
import sharp from 'sharp';

export const runtime = 'nodejs';

// ─── B&W Palette (for printing) ────────────────────────────────────────────────
const K = {
  black:     [0, 0, 0]       as [number, number, number],
  dkGray:    [60, 60, 60]    as [number, number, number],
  gray:      [100, 100, 100]  as [number, number, number],
  ltGray:    [180, 180, 180]  as [number, number, number],
  line:      [200, 200, 200]  as [number, number, number],
  bg:        [245, 245, 245]  as [number, number, number],
  white:     [255, 255, 255]  as [number, number, number],
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtNum(val: unknown): string {
  const n = parseFloat(String(val));
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeStr(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  const s = String(val).trim();
  return s || fallback;
}

/** Fetch an image URL and return as Buffer (jsPDF cannot use remote HTTP URLs directly).
 *  Returns null if fetch fails. Auto-detects JPEG vs PNG from URL/Content-Type. */
async function fetchImageBuffer(url: string): Promise<{ buf: Buffer; fmt: string } | null> {
  try {
    // Data URLs (base64) work directly with jsPDF — no fetch needed
    if (url.startsWith('data:')) return null;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    const ct = resp.headers.get('content-type') || '';
    const fmt = ct.includes('jpeg') || ct.includes('jpg') || url.match(/\.(jpe?g)(\?|$)/i)
      ? 'JPEG' : 'PNG';
    return { buf, fmt };
  } catch { return null; }
}

/** Make white/near-white pixels transparent so firma/cuño don't cover lines.
 *  Processes the image buffer through sharp: adds alpha channel, then sets
 *  pixels above the brightness threshold to fully transparent. */
async function makeWhiteTransparent(buf: Buffer, threshold = 235): Promise<Buffer> {
  try {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = data as unknown as Uint8Array;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      // If pixel is near-white, make it fully transparent
      if (r > threshold && g > threshold && b > threshold) {
        pixels[i + 3] = 0; // alpha = 0 (transparent)
      }
    }

    return sharp(pixels, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();
  } catch {
    // If sharp fails, return original buffer (no transparency but at least it works)
    return buf;
  }
}

/** Draw a thin horizontal rule */
function hline(doc: any, x1: number, y: number, x2: number, width = 0.3) {
  doc.setDrawColor(...K.ltGray);
  doc.setLineWidth(width);
  doc.line(x1, y, x2, y);
}

/** Draw a double-line rule (for formal documents) */
function doubleLine(doc: any, x1: number, y: number, x2: number) {
  doc.setDrawColor(...K.dkGray);
  doc.setLineWidth(0.5);
  doc.line(x1, y, x2, y);
  doc.setLineWidth(0.2);
  doc.line(x1, y + 1.2, x2, y + 1.2);
}

// ─── Main Export Handler ────────────────────────────────────────────────────────

async function exportPdfHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // NOTE: No CSRF validateOrigin here — this is a read-only PDF generation endpoint
    // (no DB writes). withAuth already validates the session; rateLimit prevents abuse.

    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 20 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await req.json();

    // Validate input schema
    const validated = ofertaPdfExportSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: zodError(validated.error) },
        { status: 400 }
      );
    }

    const { ofertaId, store_id } = validated.data;

    let oferta: any;
    let storeData: any = null; // Store data for auto-preloading

    if (ofertaId) {
      if (!store_id) {
        return NextResponse.json({ error: 'store_id requerido para obtener oferta de BD' }, { status: 400 });
      }
      const memberships = (session.user as any).memberships || [];
      const isAdmin = session.user.role === 'admin';
      const hasAccess = isAdmin || memberships.some(
        (m: any) => m.store_id === store_id && m.status === 'active'
      );
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Prohibido', message: 'No tienes acceso a esta tienda' },
          { status: 403 }
        );
      }
      const client = getSupabaseAuthClient(session.token);
      const { data, error } = await client
        .from('ofertas')
        .select('*')
        .eq('id', ofertaId)
        .neq('status', 'expired')
        .single();
      if (error || !data) {
        return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
      }
      oferta = data;
    } else {
      oferta = validated.data.oferta || {};
    }

    // ─── Auto-preload store data for suministrador ─────────────────────────
    // If store_id is provided, fetch store details and merge into suministrador
    if (store_id) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (url && key) {
          const adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
          const { data: store } = await adminClient
            .from('stores')
            .select('id, name, address, phone, email, logo_url, reeup, nit, bank_account, signature_url, stamp_url, latitude, longitude')
            .eq('id', store_id)
            .single();
          if (store) {
            storeData = store;
          }
        }
      } catch (e) {
        // Non-critical: store data enrichment is optional
        console.warn('Could not fetch store data for PDF enrichment:', e);
      }
    }

    // ─── Merge store data into suministrador (store overrides empty fields) ──
    if (storeData) {
      const suministrador = oferta.suministrador || {};
      oferta.suministrador = {
        empresa: suministrador.empresa || storeData.name || '',
        codigo_reup: suministrador.codigo_reup || storeData.reeup || '',
        codigo_nit: suministrador.codigo_nit || storeData.nit || '',
        direccion: suministrador.direccion || storeData.address || '',
        telefono: suministrador.telefono || storeData.phone || '',
        email: suministrador.email || storeData.email || '',
        cuenta_bancaria: suministrador.cuenta_bancaria || storeData.bank_account || '',
      };
      // Auto-preload stamp and signature from store
      if (!oferta.stamp_url && storeData.stamp_url) oferta.stamp_url = storeData.stamp_url;
      if (!oferta.sign_url && storeData.signature_url) oferta.sign_url = storeData.signature_url;
      // Auto-preload logo (used in header area)
      if (!oferta.logo_url && storeData.logo_url) oferta.logo_url = storeData.logo_url;
    }

    // ─── Extract data with safe defaults ─────────────────────────────────────
    const productos = Array.isArray(oferta.productos) ? oferta.productos : [];
    const suministrador = oferta.suministrador || {};
    const cliente = oferta.cliente || {};
    const moneda = safeStr(oferta.moneda, 'CUP');
    const status = safeStr(oferta.status, 'draft');

    const subtotal = productos.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0), 0
    ) || (parseFloat(oferta.subtotal) || 0);

    const descuento = parseFloat(oferta.descuento) || 0;
    const impuestoRate = parseFloat(oferta.itbis) || 0;
    const impuestoAmount = impuestoRate > 0 && impuestoRate < 100
      ? (subtotal - descuento) * impuestoRate / (100 - impuestoRate)
      : 0;
    const total = (subtotal - descuento) + impuestoAmount;

    // ─── Create PDF — Landscape A4 (horizontal, como documento oficial cubano) ──
    const doc = await createPDFDocument('l', 'mm', 'a4');
    const pw = doc.internal.pageSize.width;   // 297 (landscape)
    const ph = doc.internal.pageSize.height;   // 210 (landscape)
    const m = 12;                              // margin
    const cw = pw - m * 2;                     // content width = 273

    let y = m;

    // ══════════════════════════════════════════════════════════════════════════
    // HEADER: Title block — clean, formal (with optional store logo)
    // ══════════════════════════════════════════════════════════════════════════

    // Store logo on the left (if available)
    // Logo is placed well ABOVE the double line with safety margin so it never
    // overlaps — it should push the line down, not sit on top of it.
    const logoUrl = oferta.logo_url || (storeData?.logo_url) || null;
    const logoSize = 24;
    if (logoUrl) {
      try {
        // Position logo starting from the top margin, fully above the double line
        const logoY = y;
        if (logoUrl.startsWith('data:')) {
          doc.addImage(logoUrl, 'PNG', m, logoY, logoSize, logoSize);
        } else {
          const imgData = await fetchImageBuffer(logoUrl);
          if (imgData) {
            const transparentBuf = await makeWhiteTransparent(imgData.buf);
            doc.addImage(transparentBuf, 'PNG', m, logoY, logoSize, logoSize);
          }
        }
      } catch { /* ignore logo errors */ }
    }

    // Title centered on the full page width
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...K.black);
    doc.text('OFERTA COMERCIAL', pw / 2, y + 8, { align: 'center' });

    // Right side: number + date
    const numText = safeStr(oferta.numero, 'S/N');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...K.gray);
    doc.text(`No. ${numText}`, pw - m, y + 2, { align: 'right' });

    const fechaText = safeStr(oferta.fecha, '___/___/______');
    doc.text(`Fecha: ${fechaText}`, pw - m, y + 7, { align: 'right' });

    // Double line positioned AFTER the logo with a safety gap
    y += logoUrl ? logoSize + 2 : 12;
    doubleLine(doc, m, y, pw - m);
    y += 5;

    // Validez + Moneda on one line (Estado is intentionally NOT shown on the PDF)
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...K.dkGray);

    const valStr = safeStr(oferta.validez, '___');
    doc.text(`Validez: ${valStr}`, m, y);
    doc.text(`Moneda: ${moneda}`, m + 65, y);

    y += 6;

    // ══════════════════════════════════════════════════════════════════════════
    // SUMINISTRADOR / CLIENTE — compact two-column with lines
    // ══════════════════════════════════════════════════════════════════════════
    const colW = (cw - 8) / 2;  // 8mm gap between columns
    const leftX = m;
    const rightX = m + colW + 8;

    function drawInfoBlock(x: number, title: string, fields: { l: string; v: string }[]) {
      let iy = y;

      // Section title
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...K.black);
      doc.text(title, x, iy);
      iy += 1.5;
      hline(doc, x, iy, x + colW, 0.4);
      iy += 4;

      // Fields
      doc.setFontSize(7);
      fields.forEach((field) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...K.dkGray);
        const labelText = `${field.l}:`;
        doc.text(labelText, x, iy);
        const lw = doc.getTextWidth(labelText) + 2;

        doc.setFont('helvetica', 'normal');
        if (field.v) {
          doc.setTextColor(...K.black);
          doc.text(field.v, x + lw, iy);
        } else {
          doc.setDrawColor(...K.ltGray);
          doc.setLineWidth(0.15);
          doc.line(x + lw, iy + 0.5, x + colW, iy + 0.5);
        }
        iy += 3.8;
      });

      return iy;
    }

    const suminFields = [
      { l: 'Empresa', v: safeStr(suministrador.empresa) },
      { l: 'REUP', v: safeStr(suministrador.codigo_reup) },
      { l: 'NIT', v: safeStr(suministrador.codigo_nit) },
      { l: 'Dirección', v: safeStr(suministrador.direccion) },
      { l: 'Teléfono', v: safeStr(suministrador.telefono) },
      { l: 'Email', v: safeStr(suministrador.email) },
      { l: 'Cuenta Bancaria', v: safeStr(suministrador.cuenta_bancaria) },
    ];

    const clientFields = [
      { l: 'Empresa', v: safeStr(cliente.empresa) },
      { l: 'Contacto', v: safeStr(cliente.contacto) },
      { l: 'REUP', v: safeStr(cliente.codigo_reup) },
      { l: 'NIT', v: safeStr(cliente.codigo_nit) },
      { l: 'Dirección', v: safeStr(cliente.direccion) },
      { l: 'Teléfono', v: safeStr(cliente.telefono) },
      { l: 'Email', v: safeStr(cliente.email) },
    ];

    const leftEnd = drawInfoBlock(leftX, 'SUMINISTRADOR', suminFields);
    const rightEnd = drawInfoBlock(rightX, 'CLIENTE', clientFields);
    y = Math.max(leftEnd, rightEnd) + 4;

    // ══════════════════════════════════════════════════════════════════════════
    // OBJETO — single compact line
    // ══════════════════════════════════════════════════════════════════════════
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...K.black);
    doc.text('Objeto:', m, y);

    const objetoText = safeStr(oferta.objeto);
    if (objetoText) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...K.dkGray);
      doc.text(objetoText, m + 16, y);
    } else {
      doc.setDrawColor(...K.ltGray);
      doc.setLineWidth(0.15);
      doc.line(m + 16, y + 0.5, pw - m, y + 0.5);
    }
    y += 5;

    hline(doc, m, y, pw - m, 0.3);
    y += 3;

    // ══════════════════════════════════════════════════════════════════════════
    // PRODUCTS TABLE — compact, B&W
    // ══════════════════════════════════════════════════════════════════════════

    // Empty rows for hand-filling when no products
    const displayProducts = productos.length > 0 ? productos : Array(4).fill(null);
    const tableBody = displayProducts.map((item: any, idx: number) => [
      String(idx + 1),
      item?.codigo || '',
      item?.descripcion || '',
      item?.um || '',
      item?.cantidad || '',
      item?.precio_unitario ? fmtNum(item.precio_unitario) : '',
      (item?.cantidad && item?.precio_unitario) ? fmtNum(item.cantidad * item.precio_unitario) : '',
    ]);

    // Financial summary rows (always show)
    tableBody.push([
      { content: '', colSpan: 4, styles: { fillColor: K.bg, lineWidth: 0.1 } },
      { content: 'Subtotal', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', fillColor: K.bg, textColor: K.dkGray, fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } },
      { content: `${fmtNum(subtotal)} ${moneda}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: K.bg, textColor: K.dkGray, fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } },
    ]);

    if (descuento > 0) {
      tableBody.push([
        { content: '', colSpan: 4, styles: { lineWidth: 0.1 } },
        { content: 'Descuento', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', textColor: K.dkGray, fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } },
        { content: `-${fmtNum(descuento)} ${moneda}`, styles: { fontStyle: 'bold', halign: 'right', textColor: K.dkGray, fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } },
      ]);
    }

    if (impuestoRate > 0) {
      tableBody.push([
        { content: '', colSpan: 4, styles: { fillColor: K.bg, lineWidth: 0.1 } },
        { content: `Impuesto (${impuestoRate}%)`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', fillColor: K.bg, textColor: K.dkGray, fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } },
        { content: `${fmtNum(impuestoAmount)} ${moneda}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: K.bg, textColor: K.dkGray, fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } },
      ]);
    }

    // TOTAL row
    tableBody.push([
      { content: '', colSpan: 4, styles: { lineWidth: 0.1 } },
      { content: 'TOTAL', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', textColor: K.black, fontSize: 8, cellPadding: { top: 2, right: 2, bottom: 2, left: 2 } } },
      { content: `${fmtNum(total)} ${moneda}`, styles: { fontStyle: 'bold', halign: 'right', textColor: K.black, fontSize: 8, cellPadding: { top: 2, right: 2, bottom: 2, left: 2 } } },
    ]);

    autoTable(doc, {
      startY: y,
      head: [['No.', 'CÓDIGO', 'DESCRIPCIÓN', 'UM', 'CANT.', 'PRECIO UNIT.', 'IMPORTE']],
      body: tableBody,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
        lineColor: K.ltGray,
        lineWidth: 0.15,
        textColor: K.black,
      },
      headStyles: {
        fillColor: K.dkGray,
        textColor: K.white,
        halign: 'center',
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 28 },
        2: { cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 16 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 30 },
        6: { halign: 'right', cellWidth: 32 },
      },
      margin: { left: m, right: m },
    });

    y = (doc as any).lastAutoTable.finalY + 4;

    // ══════════════════════════════════════════════════════════════════════════
    // CONDICIONES — compact 3-column inline
    // ══════════════════════════════════════════════════════════════════════════
    hline(doc, m, y, pw - m, 0.3);
    y += 4;

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...K.black);
    doc.text('CONDICIONES', m, y);
    y += 4;

    doc.setFontSize(6.5);
    const condiciones = [
      { l: 'Validez', v: safeStr(oferta.validez, '___') },
      { l: 'Pago', v: safeStr(oferta.condiciones_pago, '___') },
      { l: 'Entrega', v: safeStr(oferta.condiciones_entrega, '___') },
    ];

    const condColW = cw / 3;
    condiciones.forEach((cond, i) => {
      const cx = m + i * condColW;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...K.dkGray);
      doc.text(`${cond.l}:`, cx, y);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...K.black);
      if (cond.v && cond.v !== '___') {
        const lw = doc.getTextWidth(`${cond.l}: `) + 1;
        const maxW = condColW - lw - 2;
        const lines = doc.splitTextToSize(cond.v, maxW);
        lines.slice(0, 2).forEach((line: string, li: number) => {
          doc.text(line, cx + lw, y + li * 3.2);
        });
      } else {
        doc.setDrawColor(...K.ltGray);
        doc.setLineWidth(0.15);
        const lw = doc.getTextWidth(`${cond.l}: `) + 1;
        doc.line(cx + lw, y + 0.5, cx + condColW - 2, y + 0.5);
      }
    });
    y += 8;

    // ══════════════════════════════════════════════════════════════════════════
    // OBSERVACIONES (if any)
    // ══════════════════════════════════════════════════════════════════════════
    const notasText = safeStr(oferta.notas);
    if (notasText) {
      hline(doc, m, y, pw - m, 0.3);
      y += 4;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...K.black);
      doc.text('OBSERVACIONES', m, y);
      y += 3.5;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...K.dkGray);
      const noteLines = doc.splitTextToSize(notasText, cw - 4);
      noteLines.slice(0, 3).forEach((line: string, i: number) => {
        doc.text(line, m + 2, y + i * 3.2);
      });
      y += Math.min(noteLines.length, 3) * 3.2 + 2;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SIGNATURES — anchored to bottom of page
    // Layout: PRESTADOR (50%) | CLIENTE (50%)
    // In PRESTADOR: firma goes first (center-left), then cuño overlaps
    // partially on top (as in reality: you sign then stamp over/next to it)
    // ══════════════════════════════════════════════════════════════════════════
    const signLineY = ph - m - 14;
    const signNameY = signLineY + 5;
    const signCargoY = signLineY + 9;

    if (y < signLineY - 22) {
      hline(doc, m, signLineY - 22, pw - m, 0.2);
    }

    // Equal 50/50 split between PRESTADOR and CLIENTE
    const signGap = 10;
    const signColW = (cw - signGap) / 2;
    const lx = m;
    const rx = m + signColW + signGap;

    // ─── PRESTADOR ─────────────────────────────────────────────
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...K.black);
    doc.text('PRESTADOR', lx, signLineY - 5);

    // Firma (signature) — positioned to the RIGHT of the PRESTADOR label
    // so it never overlaps the text. Label "PRESTADOR" ≈ 22mm wide at 7.5pt.
    // Background is made transparent so it doesn't cover the signature line
    const firmaStartX = lx + 24;
    const signScale = (oferta.sign_scale || 100) / 100;
    const signW = 30 * signScale;
    const signH = 18 * signScale;

    if (oferta.sign_url) {
      try {
        // Position firma after the PRESTADOR label with some padding
        const x = firmaStartX;
        const imgY = signLineY - signH - 3;
        if (oferta.sign_url.startsWith('data:')) {
          doc.addImage(oferta.sign_url, 'PNG', x, imgY, signW, signH);
        } else {
          const imgData = await fetchImageBuffer(oferta.sign_url);
          if (imgData) {
            const transparentBuf = await makeWhiteTransparent(imgData.buf);
            doc.addImage(transparentBuf, 'PNG', x, imgY, signW, signH);
          }
        }
      } catch { /* ignore */ }
    }

    // Cuño (stamp) — overlaps on top of the firma (real-world: you sign then stamp over)
    // Offset 70% to the right from firma's left edge
    // Background is made transparent so only the stamp impression is visible
    if (oferta.stamp_url) {
      try {
        const stampScale = (oferta.stamp_scale || 100) / 100;
        const stampW = 26 * stampScale;
        const stampH = 16 * stampScale;
        // Cuño starts at 70% of firma width from firma's left edge
        const x = firmaStartX + Math.round(0.7 * signW);
        const imgY = signLineY - stampH - 1;
        if (oferta.stamp_url.startsWith('data:')) {
          doc.addImage(oferta.stamp_url, 'PNG', x, imgY, stampW, stampH);
        } else {
          const imgData = await fetchImageBuffer(oferta.stamp_url);
          if (imgData) {
            const transparentBuf = await makeWhiteTransparent(imgData.buf);
            doc.addImage(transparentBuf, 'PNG', x, imgY, stampW, stampH);
          }
        }
      } catch { /* ignore */ }
    }

    // Prestador signature line
    doc.setDrawColor(...K.dkGray);
    doc.setLineWidth(0.3);
    doc.line(lx + 8, signLineY, lx + signColW - 8, signLineY);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...K.gray);
    doc.text('Nombre y Apellidos', lx + signColW / 2, signNameY, { align: 'center' });
    doc.text('Cargo', lx + signColW / 2, signCargoY, { align: 'center' });

    // ─── CLIENTE ───────────────────────────────────────────────
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...K.black);
    doc.text('CLIENTE', rx, signLineY - 5);

    doc.setDrawColor(...K.dkGray);
    doc.setLineWidth(0.3);
    doc.line(rx + 8, signLineY, rx + signColW - 8, signLineY);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...K.gray);
    doc.text('Nombre y Apellidos', rx + signColW / 2, signNameY, { align: 'center' });
    doc.text('Cargo', rx + signColW / 2, signCargoY, { align: 'center' });

    // ══════════════════════════════════════════════════════════════════════════
    // FOOTER — minimal, B&W
    // ══════════════════════════════════════════════════════════════════════════
    const footerY = ph - 4;
    const ts = new Date().toLocaleString('es-CU');

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...K.ltGray);
      doc.text(`Generado por CostPro — ${ts}`, m, footerY);
      doc.text(`Pág. ${i}/${totalPages}`, pw - m, footerY, { align: 'right' });
    }

    // ─── Output ──────────────────────────────────────────────────────────────
    const pdfBuffer = doc.output('arraybuffer');
    const fileName = `oferta-${safeStr(oferta.numero, 'comercial').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error('Oferta PDF Export Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export const POST = withTracing(
  withAuth(exportPdfHandler as any) as any,
  'POST /api/ofertas/export-pdf'
);
