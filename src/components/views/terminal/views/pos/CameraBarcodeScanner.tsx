'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, CameraOff, AlertTriangle, CheckCircle2, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * CameraBarcodeScanner — Escáner de códigos de barras con cámara.
 *
 * Arquitectura:
 *   1. BarcodeDetector API nativa (Android Chrome, Edge) — primera opción.
 *   2. ZXing (@zxing/browser) como fallback — iOS Safari, Firefox, etc.
 *
 * Soporta: EAN-13, EAN-8, CODE-128, UPC-A, UPC-E, QR Code.
 *
 * Compatibilidad:
 *   - Android Chrome (BarcodeDetector nativo)
 *   - PWA instalada (camera permission persistente)
 *   - APK generada desde PWA Builder (usa WebView con Chrome → BarcodeDetector)
 *   - iOS Safari (ZXing fallback)
 *   - Desktop con webcam (ZXing fallback)
 *
 * Uso:
 *   <CameraBarcodeScanner
 *     isOpen={true}
 *     onScan={(code) => console.log(code)}
 *     onClose={() => setOpen(false)}
 *   />
 */

interface CameraBarcodeScannerProps {
  isOpen: boolean;
  onScan: (code: string) => void;
  onClose: () => void;
}

// Tipos de código soportados
const BARCODE_FORMATS = [
  'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code',
];

export default function CameraBarcodeScanner({ isOpen, onScan, onClose }: CameraBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const zxingReaderRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'error' | 'denied'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [method, setMethod] = useState<'BarcodeDetector' | 'ZXing' | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  // FIX PWA-CAM: detectar si corremos dentro de una TWA (APK generada por
  // PWA Builder) vs navegador normal. Esto cambia el mensaje de error y los
  // botones que se muestran cuando el permiso de cámara está denegado.
  const [platform, setPlatform] = useState<'apk-twa' | 'browser'>('browser');

  // ── Detectar plataforma TWA ──
  useEffect(() => {
    // Detectar si estamos corriendo dentro de una TWA (Trusted Web Activity)
    // generada por PWA Builder. En TWA, document.referrer empieza con 'android-app://'.
    if (typeof document !== 'undefined' && document.referrer.startsWith('android-app://')) {
      setPlatform('apk-twa');
    }
  }, []);

  // ── Detectar si BarcodeDetector está disponible ──
  const isBarcodeDetectorSupported = useCallback(() => {
    return typeof window !== 'undefined' && 'BarcodeDetector' in window;
  }, []);

  // ── Inicializar BarcodeDetector nativo ──
  const initBarcodeDetector = useCallback(async () => {
    try {
      const BD = (window as any).BarcodeDetector;
      const formats = await BD.getSupportedFormats();
      const supported = formats.filter((f: string) => BARCODE_FORMATS.includes(f));
      if (supported.length === 0) return null;

      const detector = new BD({ formats: supported });
      return detector;
    } catch {
      return null;
    }
  }, []);

  // ── Inicializar ZXing reader ──
  const initZXing = useCallback(async () => {
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

      const hints = new Map();
      const formats = [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ];
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

      const reader = new BrowserMultiFormatReader(hints);
      return reader;
    } catch {
      return null;
    }
  }, []);

  // ── Loop de escaneo con BarcodeDetector nativo ──
  const scanLoopBarcodeDetector = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || status !== 'scanning') return;

    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length > 0) {
        const code = codes[0].rawValue;
        if (code && code !== lastScan) {
          setLastScan(code);
          setScanCount(c => c + 1);
          onScan(code);
          // Vibración háptica si está disponible
          if (navigator.vibrate) navigator.vibrate(100);
        }
      }
    } catch {
      // Error no fatal — continuar escaneando
    }

    rafRef.current = requestAnimationFrame(scanLoopBarcodeDetector);
  }, [status, lastScan, onScan]);

  // ── Loop de escaneo con ZXing ──
  const startZXingScan = useCallback(() => {
    if (!videoRef.current || !zxingReaderRef.current || status !== 'scanning') return;

    try {
      zxingReaderRef.current.decodeFromVideoDevice(
        undefined, // cámara por defecto (usualmente frontal en desktop)
        videoRef.current,
        (result: any, err: any) => {
          if (result) {
            const code = result.getText();
            if (code && code !== lastScan) {
              setLastScan(code);
              setScanCount(c => c + 1);
              onScan(code);
              if (navigator.vibrate) navigator.vibrate(100);
            }
          }
        }
      );
    } catch (e) {
      console.error('[ZXing] scan error:', e);
    }
  }, [status, lastScan, onScan]);

  // ── Mensaje de permiso denegado según plataforma ──
  const buildDeniedMessage = useCallback(() => {
    return platform === 'apk-twa'
      ? 'La app no tiene permiso de cámara. Ve a Ajustes de Android → Apps → CostPro → Permisos → Cámara y actívalo.'
      : 'Permiso de cámara denegado. Toca el candado 🔒 junto a la URL → Permisos del sitio → Cámara → Permitir. Si ya está permitido y no funciona, verifica que la app del navegador tenga permiso de cámara en Ajustes de Android.';
  }, [platform]);

  // ── Iniciar cámara ──
  const startCamera = useCallback(async () => {
    setStatus('starting');
    setErrorMsg('');

    // FIX PWA-CAM: Verificar permiso antes de llamar getUserMedia.
    // navigator.permissions.query nos dice si el permiso ya está 'denied'
    // sin disparar otro NotAllowedError. Si está denegado, no tiene sentido
    // llamar getUserMedia — vamos directo al estado 'denied' con instrucciones
    // claras según el contexto (APK vs navegador).
    try {
      // @ts-ignore — PermissionName 'camera' no está en todas las TS lib defs
      const permission = await navigator.permissions?.query({ name: 'camera' });
      if (permission?.state === 'denied') {
        setStatus('denied');
        setErrorMsg(buildDeniedMessage());
        return;
      }
    } catch {
      // permissions API no soportada (Firefox, algunos navegadores) — continuar con getUserMedia
    }

    try {
      // Pedir cámara trasera con preferencia
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Verificar soporte de torch (flash)
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities?.torch) {
        setTorchSupported(true);
      }

      // Intentar BarcodeDetector primero
      if (isBarcodeDetectorSupported()) {
        const detector = await initBarcodeDetector();
        if (detector) {
          detectorRef.current = detector;
          setMethod('BarcodeDetector');
          setStatus('scanning');
          rafRef.current = requestAnimationFrame(scanLoopBarcodeDetector);
          return;
        }
      }

      // Fallback: ZXing
      const reader = await initZXing();
      if (reader) {
        zxingReaderRef.current = reader;
        setMethod('ZXing');
        setStatus('scanning');
        startZXingScan();
        return;
      }

      // Si nada funciona
      setStatus('error');
      setErrorMsg('Tu navegador no soporta escaneo de códigos de barras. Usa Chrome en Android o actualiza tu navegador.');
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        setStatus('denied');
        setErrorMsg(buildDeniedMessage());
      } else if (e.name === 'NotFoundError') {
        setStatus('error');
        setErrorMsg('No se encontró ninguna cámara en este dispositivo.');
      } else {
        setStatus('error');
        setErrorMsg(e.message || 'Error al acceder a la cámara.');
      }
    }
  }, [isBarcodeDetectorSupported, initBarcodeDetector, initZXing, scanLoopBarcodeDetector, startZXingScan, buildDeniedMessage]);

  // ── Detener cámara ──
  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (zxingReaderRef.current) {
      try { zxingReaderRef.current.reset(); } catch {}
      zxingReaderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectorRef.current = null;
    setStatus('idle');
    setTorchOn(false);
  }, []);

  // ── Toggle torch ──
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const caps = track.getCapabilities?.() as any;
    if (!caps?.torch) return;

    try {
      const newValue = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: newValue } as any] });
      setTorchOn(newValue);
    } catch (e) {
      console.error('[Torch] error:', e);
    }
  }, [torchOn]);

  // ── Auto-iniciar cuando se abre ──
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);  

  // ── Cleanup al desmontar ──
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* ── Video stream ── */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Overlay con frame de escaneo */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-40 max-w-[80vw]">
              {/* Esquinas del frame */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
              {/* Línea de escaneo animada */}
              <div
                className="absolute left-0 right-0 h-0.5 bg-green-400 shadow-lg shadow-green-400/50"
                style={{ animation: 'scan-line 2s ease-in-out infinite' }}
              />
            </div>
          </div>
        )}

        {/* Loading */}
        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-12 h-12 text-green-400 animate-spin" />
            <p className="text-sm font-bold text-white/80 uppercase tracking-widest">Iniciando cámara...</p>
          </div>
        )}

        {/* Error */}
        {(status === 'error' || status === 'denied') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              {status === 'denied' ? <CameraOff className="w-8 h-8 text-red-400" /> : <AlertTriangle className="w-8 h-8 text-amber-400" />}
            </div>
            <p className="text-sm text-white/80 text-center max-w-xs whitespace-pre-line">{errorMsg}</p>

            {/* Botones según plataforma */}
            {status === 'denied' && platform === 'apk-twa' && (
              <button
                onClick={() => {
                  // Intentar abrir ajustes de la app en Android.
                  // Puede no funcionar en todos los dispositivos — el mensaje de texto
                  // ya explica los pasos manuales como fallback.
                  try {
                    window.location.href = 'app-settings:';
                  } catch {
                    // ignore — el usuario sigue los pasos manuales del texto
                  }
                }}
                className="px-6 py-3 rounded-xl bg-green-500 text-white font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-colors"
              >
                Abrir ajustes de la app
              </button>
            )}

            {/* Reintentar — útil si el usuario ya activó el permiso manualmente */}
            <button
              onClick={startCamera}
              className="px-6 py-3 rounded-xl bg-white/10 text-white font-black text-xs uppercase tracking-widest hover:bg-white/20 transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Header overlay */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-white" />
            <span className="text-sm font-black text-white uppercase tracking-widest">
              Escáner {method && <span className="text-green-400 text-xs">· {method}</span>}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Cerrar escáner"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Torch button */}
        {status === 'scanning' && torchSupported && (
          <button
            onClick={toggleTorch}
            className={cn(
              "absolute top-20 right-4 w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-colors",
              torchOn ? "bg-amber-500 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"
            )}
            aria-label={torchOn ? 'Apagar linterna' : 'Encender linterna'}
          >
            <Zap className="w-5 h-5" />
          </button>
        )}

        {/* Scan counter */}
        {status === 'scanning' && scanCount > 0 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-green-500/20 backdrop-blur-md border border-green-500/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs font-black text-green-400 uppercase tracking-widest">
              {scanCount} {scanCount === 1 ? 'código leído' : 'códigos leídos'}
            </span>
          </div>
        )}

        {/* Last scan display */}
        {status === 'scanning' && lastScan && (
          <div className="absolute bottom-40 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/60 backdrop-blur-md">
            <span className="text-xs font-mono text-white/80">Último: {lastScan}</span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="bg-black p-4 flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs text-white/50">
            {status === 'scanning'
              ? 'Enfoca el código de barras dentro del marco verde'
              : status === 'starting'
              ? 'Iniciando cámara...'
              : 'Esperando permiso de cámara'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-6 py-3 rounded-xl bg-white/10 text-white font-black text-xs uppercase tracking-widest hover:bg-white/20 transition-colors min-h-[44px]"
        >
          Cerrar
        </button>
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes scan-line {
          0%, 100% { top: 0; }
          50% { top: calc(100% - 2px); }
        }
      `}</style>
    </div>
  );
}
