"use client";

import React, { useEffect, useRef } from "react";
import { QrCode } from "lucide-react";

interface SaleQRCodeProps {
  saleId: string;
  size?: number;
}

/**
 * SaleQRCode: Generates a real QR code encoding a sale verification URL.
 * Uses the `qrcode` package (Canvas API) with graceful fallback to a static icon.
 */
export function SaleQRCode({ saleId, size = 128 }: SaleQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = React.useState(false);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      if (!canvasRef.current || !saleId) return;
      try {
        const QRCode = (await import("qrcode")).default;

        const url =
          typeof window !== "undefined"
            ? `${window.location.origin}/verify-sale/${saleId}`
            : `https://costpro.app/verify-sale/${saleId}`;

        await QRCode.toCanvas(canvasRef.current, url, {
          width: size,
          margin: 2,
          color: { dark: "#1a1a1a", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });

        if (!cancelled) setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    generate();
    return () => {
      cancelled = true;
    };
  }, [saleId, size]);

  if (failed) {
    return (
      <div
        className="flex items-center justify-center bg-muted rounded-2xl"
        style={{ width: size, height: size }}
      >
        <QrCode className="w-12 h-12 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="rounded-2xl shadow-md"
      style={{ width: size, height: size }}
      aria-label={`Código QR de verificación para venta ${saleId}`}
    />
  );
}
