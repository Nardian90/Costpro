"use client";

import { useCallback } from "react";
import autoTable from 'jspdf-autotable';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import type { LastSale } from "./POSCart.types";

interface UsePOSCartExportsOptions {
  lastSale?: LastSale | null;
}

/** Resolve the current CSS --primary color to RGB for PDF rendering */
function resolvePrimaryColor(): [number, number, number] {
  if (typeof window === "undefined") return [21, 128, 61]; // green-700 fallback
  try {
    const root = document.documentElement;
    const raw = getComputedStyle(root).getPropertyValue("--primary").trim();
    if (!raw) return [21, 128, 61];
    // Parse hex: #RRGGBB
    if (raw.startsWith("#") && raw.length === 7) {
      const r = parseInt(raw.slice(1, 3), 16);
      const g = parseInt(raw.slice(3, 5), 16);
      const b = parseInt(raw.slice(5, 7), 16);
      return [r, g, b];
    }
    // Fallback for rgb(r, g, b) or named colors — use canvas trick
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = raw;
      const computed = ctx.fillStyle; // browser normalizes to #rrggbb
      if (computed.startsWith("#") && computed.length === 7) {
        return [
          parseInt(computed.slice(1, 3), 16),
          parseInt(computed.slice(3, 5), 16),
          parseInt(computed.slice(5, 7), 16),
        ];
      }
    }
  } catch {
    // ignore parsing errors
  }
  return [21, 128, 61];
}

export function usePOSCartExports({ lastSale }: UsePOSCartExportsOptions) {
  const generatePDF = useCallback(async () => {
    if (!lastSale) return;
    const doc = await createPDFDocument();
    const pageWidth = doc.internal.pageSize.getWidth();
    const primary = resolvePrimaryColor();

    // Header — dynamic primary color
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("COMPROBANTE DE VENTA", 20, 25);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`ID: ${lastSale.id}`, 20, 32);
    doc.text(
      `Fecha: ${new Date(lastSale.date).toLocaleString()}`,
      pageWidth - 80,
      32,
    );

    // Body
    doc.setTextColor(33, 33, 33);
    doc.setFontSize(14);
    doc.text("Detalle de Compra", 20, 55);

    autoTable(doc, {
      startY: 60,
      head: [["Producto", "Cant.", "Precio", "Subtotal"]],
      body: lastSale.items.map((item: LastSale["items"][number]) => [
        item.product.name,
        item.quantity,
        formatCurrency(item.price),
        formatCurrency(item.subtotal),
      ]),
      theme: "striped",
      headStyles: { fillColor: primary },
      margin: { left: 20, right: 20 },
    });

    // jspdf-autotable attaches lastAutoTable to the doc instance
    const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    const finalY = (lastAutoTable?.finalY ?? 90) + 10;

    // Totals
    doc.setFontSize(12);
    doc.text(
      `Subtotal: ${formatCurrency(lastSale.subtotal)}`,
      pageWidth - 80,
      finalY,
    );
    if (lastSale.discount && lastSale.discount.value > 0) {
      doc.text(
        `Descuento: -${formatCurrency(
          lastSale.discount.type === "percentage"
            ? (lastSale.subtotal * lastSale.discount.value) / 100
            : lastSale.discount.value,
        )}`,
        pageWidth - 80,
        finalY + 7,
      );
    }
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(
      `TOTAL: ${formatCurrency(lastSale.total)}`,
      pageWidth - 80,
      finalY + 15,
    );

    // Footer
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 260, pageWidth - 20, 260);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Gracias por su preferencia.", pageWidth / 2, 270, {
      align: "center",
    });
    doc.text(
      "Este es un comprobante electrónico generado por CostPro.",
      pageWidth / 2,
      275,
      { align: "center" },
    );

    doc.save(`venta-${lastSale.id.substring(0, 8)}.pdf`);
    toast.success("PDF generado correctamente");
  }, [lastSale]);

  const shareWhatsApp = useCallback(() => {
    if (!lastSale) return;
    const itemsList = lastSale.items
      .map(
        (item: LastSale["items"][number]) =>
          `${item.product.name} x${item.quantity} - ${formatCurrency(item.subtotal)}`,
      )
      .join("\n");
    const message = `¡Hola!\nDetalle de Venta:\n${itemsList}\n\nTotal: ${formatCurrency(lastSale.total)}\nMétodo: ${lastSale.paymentMethod === "cash" ? "Efectivo" : "Transferencia"}\n\nGracias por su preferencia.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }, [lastSale]);

  const exportAsImage = useCallback(async () => {
    const element = document.getElementById("sale-success-content");
    if (!element) return;

    const toastId = toast.loading("Generando imagen...");
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || '#ffffff',
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.9);
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `venta-${lastSale?.id.substring(0, 8)}.jpg`;
      link.click();
      toast.success("Imagen guardada", { id: toastId });
    } catch {
      toast.error("Error al generar imagen", { id: toastId });
    }
  }, [lastSale]);

  return { generatePDF, shareWhatsApp, exportAsImage };
}
