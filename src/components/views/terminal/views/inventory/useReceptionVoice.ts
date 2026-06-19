"use client";

/* eslint-disable react-hooks/set-state-in-effect -- Tarea-5: detecta capability del browser */

import { useState, useEffect, useCallback, useRef } from "react";

// Type augmentation for Web Speech API (not in default TS lib)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export interface VoiceCommand {
  type: "add" | "quantity" | "cost" | "register" | "cancel" | "unknown";
  value?: string | number;
  raw: string;
}

/**
 * EM-R6: Hook para recepción por voz.
 *
 * Usa Web Speech API (Chrome/Edge/Safari). No disponible en Firefox.
 *
 * Comandos soportados:
 * - "agregar [nombre del producto]" → busca y agrega
 * - "cantidad [número]" → setea cantidad del último item
 * - "costo [número]" → setea costo del último item
 * - "registrar" → dispara submit
 * - "cancelar" → dispara cancel
 *
 * El hook solo captura el comando; el handler decide qué hacer.
 */
export function useReceptionVoice(
  onCommand: (cmd: VoiceCommand) => void,
  enabled: boolean = true,
) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onCommandRef = useRef(onCommand);

  // Keep ref updated without restarting recognition
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  // Check support on mount
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  const parseCommand = useCallback((text: string): VoiceCommand => {
    const lower = text.toLowerCase().trim();

    // "agregar [producto]" / "añadir [producto]" / "recibir [producto]"
    if (lower.startsWith("agregar ") || lower.startsWith("añadir ") || lower.startsWith("recibir ")) {
      const value = lower.replace(/^(agregar|añadir|recibir)\s+/, "").trim();
      return { type: "add", value, raw: text };
    }

    // "cantidad [n]" / "cantidad [n] unidades"
    if (lower.startsWith("cantidad ")) {
      const match = lower.match(/cantidad\s+(\d+(?:\.\d+)?)/);
      if (match) return { type: "quantity", value: parseFloat(match[1]), raw: text };
    }

    // "costo [n]" / "costo [n] pesos"
    if (lower.startsWith("costo ")) {
      const match = lower.match(/costo\s+(\d+(?:\.\d+)?)/);
      if (match) return { type: "cost", value: parseFloat(match[1]), raw: text };
    }

    // "registrar" / "confirmar" / "registrar recepción"
    if (lower === "registrar" || lower === "confirmar" || lower.startsWith("registrar recepción") || lower.startsWith("registrar recepcion")) {
      return { type: "register", raw: text };
    }

    // "cancelar" / "salir"
    if (lower === "cancelar" || lower === "salir") {
      return { type: "cancel", raw: text };
    }

    return { type: "unknown", raw: text };
  }, []);

  const start = useCallback(() => {
    if (!enabled || !isSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript(finalTranscript);
        const cmd = parseCommand(finalTranscript);
        if (cmd.type !== "unknown") {
          onCommandRef.current(cmd);
        }
      }
    };

    recognition.onerror = (event: Event) => {
      console.error("[voice] error:", (event as any).error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [enabled, isSupported, parseCommand]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    start,
    stop,
    toggle: () => (isListening ? stop() : start()),
  };
}
