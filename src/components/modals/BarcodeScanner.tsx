'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { BaseModal } from '@/components/ui/BaseModal';
import { SecondaryButton } from '@/components/ui/atomic';
import { X, RefreshCw } from 'lucide-react';

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

/**
 * Camera-based barcode/QR scanner for mobile POS.
 * Scans product barcodes via the device camera and adds them to the cart.
 * Requires html5-qrcode (installed). Ready for future integration into the POS mobile flow.
 */
export const BarcodeScanner = ({
  isOpen,
  onClose,
  onScan
}: BarcodeScannerProps) => {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Error stopping scanner", err);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsInitializing(true);
        setError(null);
      });

      const startScanner = async () => {
        try {
          const html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;

          await html5QrCode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 150 }
            },
            (decodedText) => {
              onScan(decodedText);
              stopScanner();
              onClose();
            },
            (errorMessage) => {
              // Ignore frequent scan errors
            }
          );
          setIsInitializing(false);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "No se pudo acceder a la cámara");
          setIsInitializing(false);
        }
      };

      // Slight delay to ensure DOM is ready
      const timer = setTimeout(startScanner, 500);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
  }, [isOpen, onScan, onClose]);

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={onClose}
      title="Escanear Código de Barras"
    >
      <div className="space-y-4">
        <div className="relative aspect-video w-full bg-background rounded-2xl overflow-hidden flex items-center justify-center border-2 border-primary/20 shadow-inner">
          <div id="reader" className="w-full h-full"></div>

          {isInitializing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-foreground gap-3 z-10">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs font-black uppercase tracking-widest">Iniciando Cámara...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/90 text-foreground p-6 text-center gap-4 z-20">
              <X className="w-12 h-12" />
              <p className="font-bold">{error}</p>
              <SecondaryButton label="Reintentar" onClick={() => window.location.reload()} className="bg-background text-destructive border-none" />
            </div>
          )}

          {/* Scanner Overlay UI */}
          {!isInitializing && !error && (
            <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40">
               <div className="w-full h-full border-2 border-primary/50 relative">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary/50 shadow-[0_0_15px_rgba(0,150,136,0.8)] animate-scan"></div>
               </div>
            </div>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground uppercase font-black tracking-widest">
          Alinea el código de barras dentro del recuadro para escanearlo automáticamente.
        </p>

        <SecondaryButton
          label="Cerrar"
          onClick={onClose}
          className="w-full h-14"
        />
      </div>
    </BaseModal>
  );
};
