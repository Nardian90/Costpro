"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  X,
  Trash2,
  Minus,
  Plus,
  DollarSign,
  CreditCard,
  Check,
  AlertTriangle,
  ChevronDown,
  Percent,
  FileText,
  Send,
  RefreshCw,
  Smartphone,
  QrCode,
  Settings,
  Image as ImageIcon,
} from "lucide-react";
import { CostProLoader } from "@/components/ui/CostProLoader";
import ProductImage from "@/components/ui/ProductImage";
import { cn, formatCurrency } from "@/lib/utils";
import jspdf from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { PaymentMethod, TaxConfiguration } from "@/types";
import { useIsMobile } from "@/hooks/ui/useMobile";
import { useTaxes } from "@/hooks/api/useTaxes";
import { useAuthStore } from "@/store";
import { BaseModal } from "@/components/ui/BaseModal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/atomic";

interface POSCartProps {
  items: any[];
  onRemoveItem: (productId: string, variantId: string | null) => void;
  onUpdateQuantity: (
    productId: string,
    variantId: string | null,
    quantity: number,
  ) => void;
  onClearCart: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  discount: { type: "fixed" | "percentage"; value: number } | null;
  setDiscount: (
    discount: { type: "fixed" | "percentage"; value: number } | null,
  ) => void;
  appliedTaxes: TaxConfiguration[];
  toggleTax: (tax: TaxConfiguration) => void;
  isProcessing: boolean;
  isMobile?: boolean;
  onCheckout: (
    paymentMethod: PaymentMethod,
    discount?: { type: "fixed" | "percentage"; value: number } | null,
  ) => Promise<void>;
  onClose: () => void;
  lastSale?: any;
  onClearLastSale?: () => void;
  updateItemDiscount?: (
    productId: string,
    variantId: string | null,
    type: "percentage" | "fixed" | null,
    value: number,
  ) => void;
  updateItemPayment?: (
    productId: string,
    variantId: string | null,
    cashPaid: number,
    transferPaid: number,
  ) => void;
  prorateGlobalPayment?: (totalCash: number, totalTransfer: number) => void;
}

export const POSCart = ({
  items,
  onRemoveItem,
  onUpdateQuantity,
  onClearCart,
  getSubtotal,
  getDiscountAmount,
  getTaxAmount,
  getTotal,
  discount,
  setDiscount,
  appliedTaxes,
  isMobile: isMobileProp,
  toggleTax,
  isProcessing,
  onCheckout,
  onClose,
  lastSale,
  onClearLastSale,
  updateItemDiscount,
  updateItemPayment,
  prorateGlobalPayment,
}: POSCartProps) => {
  const { user } = useAuthStore();
  const { data: taxes = [] } = useTaxes(user?.activeStoreId);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("cash");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isEasyReading, setIsEasyReading] = useState(false);
  const [viewingImage, setViewingImage] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const isMobileHook = useIsMobile();
  const isMobile = isMobileProp ?? isMobileHook;

  const generatePDF = () => {
    if (!lastSale) return;
    const doc = new jspdf();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(0, 150, 136); // Primary Color
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
      body: lastSale.items.map((item: any) => [
        item.product.name,
        item.quantity,
        formatCurrency(item.price),
        formatCurrency(item.subtotal),
      ]),
      theme: "striped",
      headStyles: { fillColor: [0, 150, 136] },
      margin: { left: 20, right: 20 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals
    doc.setFontSize(12);
    doc.text(
      `Subtotal: ${formatCurrency(lastSale.subtotal)}`,
      pageWidth - 80,
      finalY,
    );
    if (lastSale.discount?.value > 0) {
      doc.text(
        `Descuento: -${formatCurrency(lastSale.discount.type === "percentage" ? (lastSale.subtotal * lastSale.discount.value) / 100 : lastSale.discount.value)}`,
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

    // Footer with QR Placeholder
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
  };

  const shareWhatsApp = () => {
    if (!lastSale) return;
    const itemsList = lastSale.items
      .map(
        (item: any) =>
          `${item.product.name} x${item.quantity} - ${formatCurrency(item.subtotal)}`,
      )
      .join("%0A");
    const message = `¡Hola!%0ADetalle de Venta:%0A${itemsList}%0A%0ATotal: ${formatCurrency(lastSale.total)}%0AMétodo: ${lastSale.paymentMethod === "cash" ? "Efectivo" : "Transferencia"}%0A%0AGracias por su preferencia.`;
    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  const exportAsImage = async () => {
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
    } catch (error) {
      toast.error("Error al generar imagen", { id: toastId });
    }
  };

  const SuccessView = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col items-center justify-start pt-12 sm:pt-20 p-6 text-center space-y-8 max-w-2xl mx-auto w-full overflow-y-auto no-scrollbar"
      id="sale-success-content"
    >
      <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-xl shadow-green-500/20 relative">
        <Check className="w-12 h-12 text-primary-foreground" strokeWidth={3} />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-0 bg-green-500 rounded-full"
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-[clamp(2rem,8vw,2.5rem)] font-black text-foreground tracking-tighter uppercase">
          ¡Venta Completada!
        </h2>
        <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">
          La transacción ha sido registrada exitosamente
        </p>
      </div>

      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={generatePDF}
          className="flex items-center justify-between p-6 rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform group"
        >
          <div className="text-left">
            <div className="font-black uppercase tracking-widest text-xs opacity-70 mb-1">
              Exportar
            </div>
            <div className="text-xl font-black">Recibo PDF</div>
          </div>
          <FileText className="w-8 h-8 group-hover:rotate-12 transition-transform" />
        </button>

        <button
          onClick={shareWhatsApp}
          className="flex items-center justify-between p-6 rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform group"
        >
          <div className="text-left">
            <div className="font-black uppercase tracking-widest text-xs opacity-70 mb-1">
              Compartir
            </div>
            <div className="text-xl font-black">WhatsApp</div>
          </div>
          <Send className="w-8 h-8 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
        </button>

        <button
          onClick={exportAsImage}
          className="flex items-center justify-between p-6 rounded-2xl bg-card text-primary-foreground shadow-xl shadow-border/20 hover:scale-[1.02] transition-transform group sm:col-span-2"
        >
          <div className="text-left flex items-center gap-4">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
            <div>
              <div className="font-black uppercase tracking-widest text-xs opacity-70 mb-1">
                Guardar como
              </div>
              <div className="text-xl font-black">Imagen JPG</div>
            </div>
          </div>
          <div className="px-3 py-1 bg-primary-foreground/10 rounded-full text-xs font-black uppercase">
            Alta Calidad
          </div>
        </button>
      </div>

      <div className="w-full p-6 rounded-3xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center gap-4">
        <QrCode className="w-16 h-16 opacity-20" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Código de seguimiento disponible
        </p>
      </div>

      <PrimaryButton
        label="Nueva Venta"
        icon={RefreshCw}
        onClick={onClearLastSale}
        className="w-full max-w-sm h-16 text-xl rounded-2xl shadow-2xl"
      />
    </motion.div>
  );

  const Container = motion.div;
  const containerProps = {
    initial: isMobile ? { y: "100%" } : { x: 300, opacity: 0 },
    animate: isMobile ? { y: 0 } : { x: 0, opacity: 1 },
    exit: isMobile ? { y: "100%" } : { x: 300, opacity: 0 },
    transition: { type: "spring", damping: 25, stiffness: 200 } as const,
  };

  return (
    <Container
      {...containerProps}
      className={cn(
        isMobile
          ? "fixed inset-0 z-[100] bg-background flex flex-col overflow-hidden"
          : "w-full lg:w-[450px] sticky top-[100px] h-[calc(100vh-160px)] flex flex-col overflow-hidden rounded-[2.5rem] border border-border bg-card shadow-2xl relative z-20",
        isEasyReading && "text-xl",
      )}
    >
      <div
        className={cn(
          "flex-1 flex flex-col w-full bg-card overflow-hidden",
          isMobile ? "max-w-5xl mx-auto" : "rounded-[2.5rem]",
        )}
      >
        <div className="bg-primary p-4 sm:p-6 sm:pb-10 flex items-center justify-between text-primary-foreground relative shrink-0">
          <div className="flex flex-col gap-0.5 sm:gap-1">
            <h3
              className={cn(
                "font-black uppercase tracking-widest flex items-center gap-2 sm:gap-3",
                isEasyReading ? "text-2xl" : "text-base sm:text-lg",
              )}
            >
              <ShoppingCart
                className={cn(
                  isEasyReading
                    ? "w-7 h-7 sm:w-8 sm:h-8"
                    : "w-5 h-5 sm:w-6 sm:h-6",
                )}
              />
              Caja Registradora
            </h3>
            <span
              className={cn(
                "font-bold opacity-70 uppercase tracking-widest",
                isEasyReading ? "text-xs sm:text-sm" : "text-xs sm:text-xs",
              )}
            >
              {items.length} {items.length === 1 ? "Producto" : "Productos"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setIsEasyReading(!isEasyReading)}
              className={cn(
                "p-2.5 sm:p-3 min-h-[44px] rounded-lg sm:rounded-xl transition-all active:scale-90 flex items-center gap-2 font-black uppercase tracking-widest text-xs sm:text-xs",
                isEasyReading
                  ? "bg-background text-primary"
                  : "bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground",
              )}
            >
              <div className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center border-2 border-current rounded text-xs sm:text-xs">
                A
              </div>
              <span className="hidden sm:inline">Lectura Fácil</span>
            </button>
            <button
              onClick={onClose}
              className="p-2.5 sm:p-3 bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-lg sm:rounded-xl transition-colors active:scale-90"
              aria-label="Cerrar carrito"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "flex-1 flex flex-col overflow-hidden -mt-4 sm:-mt-6 rounded-t-2xl sm:rounded-t-3xl bg-card relative z-10",
          )}
        >
          {lastSale ? (
            <SuccessView />
          ) : items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-start pt-12 p-6 text-center space-y-4">
              <div className="w-32 h-32 bg-muted rounded-full flex items-center justify-center mb-4">
                <ShoppingCart className="w-16 h-16 opacity-10" />
              </div>
              <p className="font-black uppercase tracking-widest text-xl text-foreground">
                Carrito Vacío
              </p>
              <p className="text-muted-foreground max-w-xs mx-auto">
                Agrega productos del catálogo para comenzar una nueva venta.
              </p>
              <SecondaryButton
                label="Ir al Catálogo"
                onClick={onClose}
                className="mt-4"
              />
            </div>
          ) : (
            <>
              <div className="flex-1 relative overflow-hidden flex flex-col">
                <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border p-3 sm:p-4 space-y-3 shadow-md">
                  <div className="flex gap-3">
                    <button
                      onClick={() =>
                        onCheckout(
                          selectedPayment,
                          discount && discount.value > 0 ? discount : null,
                        )
                      }
                      disabled={isProcessing || items.length === 0}
                      className="flex-1 h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-primary text-primary-foreground font-black text-xs sm:text-sm shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    >
                      {isProcessing ? (
                        <CostProLoader
                          size={20}
                          showText={false}
                          showSubtext={false}
                        />
                      ) : (
                        <Check className="w-5 h-5 sm:w-6 sm:h-6" />
                      )}
                      {isProcessing ? "PROCESANDO..." : "CONFIRMAR VENTA"}
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-destructive/10 text-destructive border-2 border-destructive/20 hover:bg-destructive/20 transition-all flex items-center justify-center active:scale-[0.95]"
                      title="Anular Carrito"
                    >
                      <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>

                  {/* Accordion Toggle for Options */}
                  <button
                    onClick={() => setShowOptions(!showOptions)}
                    className="w-full flex items-center justify-center gap-2 py-1 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Settings
                      className={cn(
                        "w-3.5 h-3.5 transition-transform duration-500",
                        showOptions && "rotate-180",
                      )}
                    />
                    {showOptions ? "Ocultar Opciones" : "Pago y Descuento"}
                  </button>

                  <AnimatePresence>
                    {showOptions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-4 pt-1 pb-2"
                      >
                        {/* Payment Method Selection */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSelectedPayment("cash")}
                            className={cn(
                              "p-2 rounded-xl flex items-center justify-center gap-2 border-2 transition-all bg-background",
                              selectedPayment === "cash"
                                ? "border-primary shadow-lg shadow-primary/10 text-primary"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            <DollarSign className="w-4 h-4" />
                            <span className="text-xs font-black uppercase tracking-widest">
                              Efectivo
                            </span>
                          </button>
                          <button
                            onClick={() => setSelectedPayment("transfer")}
                            className={cn(
                              "p-2 rounded-xl flex items-center justify-center gap-2 border-2 transition-all bg-background",
                              selectedPayment === "transfer"
                                ? "border-primary shadow-lg shadow-primary/10 text-primary"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            <CreditCard className="w-4 h-4" />
                            <span className="text-xs font-black uppercase tracking-widest">
                              Transf.
                            </span>
                          </button>
                        </div>

                        {/* Discount Selection */}
                        <div className="space-y-3 p-3 rounded-xl bg-muted/50 border border-border">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                              Descuento
                            </span>
                            <div className="flex gap-1 bg-background p-0.5 rounded-lg border border-border">
                              <button
                                onClick={() =>
                                  setDiscount({
                                    type: "percentage",
                                    value: discount?.value || 0,
                                  })
                                }
                                className={cn(
                                  "px-2 py-0.5 rounded-lg text-xs font-black uppercase transition-all",
                                  discount?.type === "percentage"
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                %
                              </button>
                              <button
                                onClick={() =>
                                  setDiscount({
                                    type: "fixed",
                                    value: discount?.value || 0,
                                  })
                                }
                                className={cn(
                                  "px-2 py-0.5 rounded-lg text-xs font-black uppercase transition-all",
                                  discount?.type === "fixed"
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                $
                              </button>
                            </div>
                          </div>

                          <div className="flex gap-1.5">
                            {[0, 5, 10, 15].map((d) => (
                              <button
                                key={d}
                                onClick={() =>
                                  setDiscount({
                                    type: discount?.type || "percentage",
                                    value: d,
                                  })
                                }
                                className={cn(
                                  "flex-1 py-2 rounded-lg border font-black text-xs uppercase transition-all",
                                  discount?.value === d &&
                                    discount?.type === "percentage"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-muted-foreground border-border",
                                )}
                              >
                                {d === 0 ? "Sin" : `${d}%`}
                              </button>
                            ))}
                          </div>

                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xs">
                              {discount?.type === "percentage" ? "%" : "$"}
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={discount?.value || ""}
                              onChange={(e) =>
                                setDiscount({
                                  type: discount?.type || "percentage",
                                  value: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-full pl-7 p-2 rounded-xl border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
                              placeholder="Monto personalizado"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div
                  className={cn("flex-1 overflow-y-auto p-4 sm:p-8 min-h-0")}
                >
                  <div className="space-y-4 pb-8">
                    <AnimatePresence initial={false}>
                      {items.map((item) => (
                        <motion.div
                          key={`${item.product_id}-${item.variant_id}`}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, x: -20 }}
                          className={cn(
                            "p-3 rounded-2xl border-2 transition-all group relative shadow-md",
                            isEasyReading ? "p-6" : "p-3",
                            item.product.stock_current <= 0
                              ? "border-destructive/20 bg-destructive/5"
                              : item.product.stock_current < 5
                                ? "border-amber-500/20 bg-amber-500/10"
                                : "border-border bg-background",
                          )}
                        >
                          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4">
                            {/* Left: Quantity Controls & Stock */}
                            <div className="flex flex-col items-center gap-1.5 shrink-0">
                              <div className="flex items-center gap-1 bg-muted/50 rounded-2xl p-1 border border-border/50">
                                <button
                                  onClick={() =>
                                    onUpdateQuantity(
                                      item.product_id,
                                      item.variant_id,
                                      item.quantity - 1,
                                    )
                                  }
                                  className={cn(
                                    "flex items-center justify-center rounded-xl bg-background shadow-sm hover:bg-primary/10 hover:text-primary transition-all active:scale-90 border border-border/50",
                                    isEasyReading
                                      ? "w-12 h-12"
                                      : "w-11 h-11 sm:w-8 sm:h-8",
                                  )}
                                  aria-label="Disminuir cantidad"
                                >
                                  <Minus className="w-5 h-5 sm:w-4 sm:h-4" />
                                </button>
                                <span
                                  className={cn(
                                    "text-center font-black px-2",
                                    isEasyReading
                                      ? "min-w-[48px] text-xl"
                                      : "min-w-[32px] text-sm sm:text-base",
                                  )}
                                  aria-label={`Cantidad: ${item.quantity}`}
                                >
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() =>
                                    onUpdateQuantity(
                                      item.product_id,
                                      item.variant_id,
                                      item.quantity + 1,
                                    )
                                  }
                                  className={cn(
                                    "flex items-center justify-center rounded-xl bg-background shadow-sm hover:bg-primary/10 hover:text-primary transition-all active:scale-90 border border-border/50",
                                    isEasyReading
                                      ? "w-12 h-12"
                                      : "w-11 h-11 sm:w-8 sm:h-8",
                                  )}
                                  aria-label="Aumentar cantidad"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                              <div
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-tight border whitespace-nowrap",
                                  item.product.stock_current > 10
                                    ? "bg-primary/10 text-primary border-primary/20"
                                    : item.product.stock_current > 0
                                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                      : "bg-destructive/10 text-destructive border-destructive/20",
                                )}
                              >
                                Stock: {item.product.stock_current}
                              </div>
                            </div>

                            {/* Center: Name and Price */}
                            <div className="min-w-0 flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <h4
                                  className={cn(
                                    "font-black uppercase tracking-tight truncate text-foreground",
                                    isEasyReading
                                      ? "text-xl"
                                      : "text-sm sm:text-base",
                                  )}
                                >
                                  {item.product.name}
                                  {item.variant && (
                                    <span className="text-primary ml-1">
                                      ({item.variant.name})
                                    </span>
                                  )}
                                </h4>
                                {(item.product.public_image_url ||
                                  item.product.image_url) && (
                                  <button
                                    onClick={() =>
                                      setViewingImage({
                                        url:
                                          item.product.public_image_url ||
                                          item.product.image_url!,
                                        name: item.product.name,
                                      })
                                    }
                                    className="p-1 hover:bg-muted rounded-full transition-colors"
                                    title="Ver imagen"
                                  >
                                    <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                              <span
                                className={cn(
                                  "font-bold text-muted-foreground",
                                  isEasyReading
                                    ? "text-base"
                                    : "text-[12px] sm:text-xs",
                                )}
                              >
                                {formatCurrency(item.price)}
                              </span>
                            </div>

                            {/* Right: Subtotal */}
                            <div className="flex flex-col items-end gap-3 sm:gap-2">
                              <button
                                onClick={() =>
                                  onRemoveItem(item.product_id, item.variant_id)
                                }
                                className="w-11 h-11 flex items-center justify-center text-muted-foreground/30 hover:text-destructive transition-all active:scale-95"
                                aria-label="Eliminar producto"
                              >
                                <X className="w-6 h-6 sm:w-5 sm:h-5" />
                              </button>
                              <div className="text-right">
                                <div
                                  className={cn(
                                    "font-black text-primary leading-none",
                                    isEasyReading
                                      ? "text-2xl"
                                      : "text-xl sm:text-lg",
                                  )}
                                >
                                  {formatCurrency(item.subtotal)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Opciones Avanzadas (Descuento y Pago Mixto) */}
                          <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-muted-foreground">
                                Descuento
                              </label>
                              <div className="flex gap-1">
                                <button
                                  onClick={() =>
                                    updateItemDiscount?.(
                                      item.product_id,
                                      item.variant_id,
                                      item.discount_type === "percentage"
                                        ? "fixed"
                                        : "percentage",
                                      item.discount_value,
                                    )
                                  }
                                  className="p-1.5 rounded-lg bg-muted hover:bg-primary/10 transition-colors"
                                >
                                  {item.discount_type === "percentage" ? (
                                    <Percent className="w-3 h-3" />
                                  ) : (
                                    <DollarSign className="w-3 h-3" />
                                  )}
                                </button>
                                <input
                                  type="number"
                                  value={item.discount_value || ""}
                                  onChange={(e) =>
                                    updateItemDiscount?.(
                                      item.product_id,
                                      item.variant_id,
                                      item.discount_type || "fixed",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="w-full bg-background border border-border/50 rounded-lg px-2 py-1 text-xs font-bold"
                                  placeholder="0"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-muted-foreground">
                                Pago Mixto
                              </label>
                              <div className="flex gap-1">
                                <div className="relative flex-1">
                                  <DollarSign className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-500" />
                                  <input
                                    type="number"
                                    value={item.cash_paid || 0}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      updateItemPayment?.(
                                        item.product_id,
                                        item.variant_id,
                                        val,
                                        item.subtotal - val,
                                      );
                                    }}
                                    className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-1 text-[10px] font-bold"
                                  />
                                </div>
                                <div className="relative flex-1">
                                  <Send className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-500" />
                                  <input
                                    type="number"
                                    value={item.transfer_paid || 0}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      updateItemPayment?.(
                                        item.product_id,
                                        item.variant_id,
                                        item.subtotal - val,
                                        val,
                                      );
                                    }}
                                    className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-1 text-[10px] font-bold"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          {Math.abs(
                            item.cash_paid + item.transfer_paid - item.subtotal,
                          ) > 0.01 && (
                            <div className="mt-1 text-[10px] font-bold text-destructive flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Error: Pago
                              no coincide ({formatCurrency(item.subtotal)})
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
                {/* Scroll Indicator Gradient */}
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card via-card/80 to-transparent pointer-events-none z-10" />
              </div>

              <div
                className={cn(
                  "p-4 sm:p-6 space-y-4 border-t border-border bg-card/80 backdrop-blur-xl sticky bottom-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]",
                  isMobile && "pb-6 rounded-t-[2.5rem]",
                )}
              >
                {/* Pago Mixto Global (Prorrateo) */}
                <div className="px-4 py-3 bg-primary/5 rounded-2xl border border-primary/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest">
                      Pago Mixto Global
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const total = getTotal();
                          prorateGlobalPayment?.(total / 2, total / 2);
                          setSelectedPayment("mixed");
                        }}
                        className="h-11 min-h-[44px] px-3 flex items-center justify-center text-[10px] font-bold text-primary hover:underline"
                      >
                        50/50
                      </button>
                      <button
                        onClick={() => {
                          const total = getTotal();
                          prorateGlobalPayment?.(total, 0);
                          setSelectedPayment("mixed");
                        }}
                        className="h-11 min-h-[44px] px-3 flex items-center justify-center text-[10px] font-bold text-primary hover:underline"
                      >
                        Todo Efectivo
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">
                        Total Efectivo
                      </label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                        <input
                          type="number"
                          placeholder="Efectivo"
                          className="w-full h-11 bg-background border border-border/50 rounded-xl pl-9 pr-3 text-sm font-black"
                          value={items
                            .reduce((acc, i) => acc + (i.cash_paid || 0), 0)
                            .toFixed(2)}
                          onChange={(e) => {
                            const cash = Number(e.target.value);
                            const total = getTotal();
                            prorateGlobalPayment?.(
                              cash,
                              Math.max(0, total - cash),
                            );
                            setSelectedPayment("mixed");
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">
                        Total Transf.
                      </label>
                      <div className="relative">
                        <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                        <input
                          type="number"
                          placeholder="Transferencia"
                          className="w-full h-11 bg-background border border-border/50 rounded-xl pl-9 pr-3 text-sm font-black"
                          value={items
                            .reduce((acc, i) => acc + (i.transfer_paid || 0), 0)
                            .toFixed(2)}
                          onChange={(e) => {
                            const transf = Number(e.target.value);
                            const total = getTotal();
                            prorateGlobalPayment?.(
                              Math.max(0, total - transf),
                              transf,
                            );
                            setSelectedPayment("mixed");
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Resumen de Totales */}
                <div className="px-4 py-3 bg-muted/30 rounded-2xl border border-border/50 space-y-1">
                  <div className="flex justify-between items-center text-xs font-black uppercase text-muted-foreground tracking-widest">
                    <span>Subtotal</span>
                    <span className="text-foreground">
                      {formatCurrency(getSubtotal())}
                    </span>
                  </div>

                  {getDiscountAmount() > 0 && (
                    <div className="flex justify-between items-center text-xs font-black uppercase text-destructive tracking-widest">
                      <span>
                        Descuento (
                        {discount?.type === "percentage"
                          ? `${discount.value}%`
                          : "Monto"}
                        )
                      </span>
                      <span>-{formatCurrency(getDiscountAmount())}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-primary/20">
                    <span className="text-xs font-black uppercase text-foreground tracking-widest">
                      Total Final
                    </span>
                    <span className="text-[clamp(1.25rem,5vw,1.5rem)] font-black text-primary tracking-tighter leading-none">
                      {formatCurrency(
                        Math.max(0, getSubtotal() - getDiscountAmount()),
                      )}
                    </span>
                  </div>
                </div>

                {/* Botones removidos de aquí y movidos a la parte superior pegajosa */}
              </div>
            </>
          )}
        </div>

        {/* Visualizador de Imagen */}
        <BaseModal
          open={!!viewingImage}
          onOpenChange={() => setViewingImage(null)}
          title={viewingImage?.name}
        >
          <div className="aspect-square w-full rounded-2xl overflow-hidden bg-muted">
            {viewingImage && (
              <ProductImage
                src={viewingImage.url}
                name={viewingImage.name}
                className="w-full h-full object-contain"
                forceShow
              />
            )}
          </div>
          <div className="mt-4">
            <SecondaryButton
              label="Cerrar"
              onClick={() => setViewingImage(null)}
              className="w-full"
            />
          </div>
        </BaseModal>

        {/* Modal de confirmación para vaciar carrito */}
        <BaseModal
          open={showClearConfirm}
          onOpenChange={setShowClearConfirm}
          title={
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-6 h-6" />
              <span>Confirmar Anulación</span>
            </div>
          }
          footer={
            <>
              <SecondaryButton
                label="No, Volver"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1"
              />
              <PrimaryButton
                label="Sí, Anular Todo"
                onClick={() => {
                  onClearCart();
                  onClose();
                  setShowClearConfirm(false);
                  toast.success("Carrito vaciado");
                }}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-primary-foreground shadow-destructive/20"
              />
            </>
          }
        >
          <div className="py-4 space-y-3">
            <p className="font-bold text-center">
              ¿Estás seguro de que deseas anular todos los productos del
              carrito?
            </p>
            <p className="text-sm text-muted-foreground text-center">
              Esta acción no se puede deshacer y perderás la selección actual.
            </p>
          </div>
        </BaseModal>
      </div>
    </Container>
  );
};
