import autoTable from 'jspdf-autotable';
"use client";

import { useCallback } from "react";
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import type { LastSale } from "./POSCart.types";

interface UsePOSCartExportsOptions {
  lastSale?: LastSale;
}

export const usePOSCartExports = ({ lastSale }: UsePOSCartExportsOptions) => {
  const generatePDF = useCallback(async () => {
    if (!lastSale) return;
    const doc = await createPDFDocument();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(0, 150, 136);
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
      headStyles: { fillColor: [0, 150, 136] },
      margin: { left: 20, right: 20 },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } })
      .lastAutoTable.finalY + 10;

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
      .join("%0A");
    const message = `¡Hola!%0ADetalle de Venta:%0A${itemsList}%0A%0ATotal: ${formatCurrency(lastSale.total)}%0AMétodo: ${lastSale.paymentMethod === "cash" ? "Efectivo" : "Transferencia"}%0A%0AGracias por su preferencia.`;
    window.open(`https://wa.me/?text=${message}`, "_blank");
  }, [lastSale]);

  const exportAsImage = useCallback(async () => {
    const element = document.getElementById("sale-success-content");
    if (!element) return;

    const toastId = toast.loading("Generando imagen...");
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
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
};
