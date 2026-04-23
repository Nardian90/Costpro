'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, FileText, Brain, Store } from 'lucide-react';
import { scenes, totalDemoDuration, type SceneConfig } from './demoData';

/* ── Lazy-loaded scenes (performance: only mount active scene) ── */
const CostSheetScene = React.lazy(() => import('./CostSheetScene'));
const IPVScene = React.lazy(() => import('./IPVScene'));
const MultiStoreScene = React.lazy(() => import('./MultiStoreScene'));

const SCENE_ICONS: Record<string, React.ReactNode> = {
  'cost-sheet': <FileText className="w-3.5 h-3.5" />,
  'ipv': <Brain className="w-3.5 h-3.5" />,
  'multi-store': <Store className="w-3.5 h-3.5" />,
};

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function InteractiveDemo() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoStarted = useRef(false);

  const scene = scenes[currentSceneIdx];
  const sceneElapsed = useMemo(() => Math.max(0, elapsed - scenes.slice(0, currentSceneIdx).reduce((s, sc) => s + sc.duration, 0)), [elapsed, currentSceneIdx]);
  const globalProgress = useMemo(() => Math.min(100, (elapsed / totalDemoDuration) * 100), [elapsed]);

  /* ── Playback engine ── */
  const tick = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    setElapsed(prev => {
      const next = prev + delta;
      if (next >= totalDemoDuration) {
        setIsPlaying(false);
        return totalDemoDuration;
      }
      // Determine current scene from global elapsed
      let acc = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (next < acc + scenes[i].duration) {
          setCurrentSceneIdx(i);
          break;
        }
        acc += scenes[i].duration;
      }
      return next;
    });

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    if (elapsed >= totalDemoDuration) {
      setElapsed(0);
      setCurrentSceneIdx(0);
      lastTimeRef.current = 0;
    }
    setIsPlaying(true);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [elapsed, tick]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = 0;
  }, []);

  const restart = useCallback(() => {
    pause();
    setElapsed(0);
    setCurrentSceneIdx(0);
  }, [pause]);

  const seekToScene = useCallback((idx: number) => {
    pause();
    const targetTime = scenes.slice(0, idx).reduce((s, sc) => s + sc.duration, 0);
    setElapsed(targetTime);
    setCurrentSceneIdx(idx);
  }, [pause]);

  /* Auto-play when in viewport */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAutoStarted.current) {
          hasAutoStarted.current = true;
          // Small delay so user sees the frame first
          setTimeout(() => play(), 800);
        }
        if (!entry.isIntersecting && isPlaying) {
          pause();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(container);
    return () => { observer.disconnect(); };
  }, [isPlaying, play, pause]);

  /* Cleanup */
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  /* ── Scene boundaries for dots ── */
  const sceneBoundaries = useMemo(() => {
    let acc = 0;
    return scenes.map(s => {
      const start = acc;
      acc += s.duration;
      return { start, end: acc };
    });
  }, []);

  return (
    <div ref={containerRef} className="w-full max-w-4xl mx-auto mt-10">
      {/* Scene label */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-4"
      >
        <p className="text-[11px] text-white/30 uppercase tracking-[0.2em] font-semibold mb-1">Demo interactivo</p>
        <h3 className="text-base sm:text-lg font-bold text-white/90 font-[family-name:var(--font-space-grotesk)]">
          Mira cómo CostPro transforma tu negocio
        </h3>
      </motion.div>

      {/* ── Player Frame ── */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0a0f1a] shadow-2xl shadow-black/40">
        {/* Scene viewport (16:9) */}
        <div className="relative aspect-video w-full overflow-hidden bg-[#0d1117]">
          <Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
            </div>
          }>
            <AnimatePresence mode="wait">
              <motion.div
                key={scene.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0"
              >
                {currentSceneIdx === 0 && <CostSheetScene elapsed={sceneElapsed} isPlaying={isPlaying} />}
                {currentSceneIdx === 1 && <IPVScene elapsed={sceneElapsed} isPlaying={isPlaying} />}
                {currentSceneIdx === 2 && <MultiStoreScene elapsed={sceneElapsed} isPlaying={isPlaying} />}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>

        {/* ── Controls bar ── */}
        <div className="px-4 py-3 bg-[#111827]/95 backdrop-blur-sm border-t border-white/[0.06]">
          {/* Progress bar */}
          <div className="w-full h-1 rounded-full bg-white/[0.06] mb-3 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const targetTime = pct * totalDemoDuration;
              pause();
              setElapsed(targetTime);
              let acc = 0;
              for (let i = 0; i < scenes.length; i++) {
                if (targetTime < acc + scenes[i].duration) {
                  setCurrentSceneIdx(i);
                  break;
                }
                acc += scenes[i].duration;
              }
            }}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
              style={{ width: `${globalProgress}%` }}
              transition={{ duration: 0.15, ease: 'linear' }}
            />
            {/* Scene boundaries (subtle dots on progress bar) */}
            {sceneBoundaries.slice(0, -1).map((b, i) => (
              <div
                key={i}
                className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-white/40"
                style={{ left: `${(b.end / totalDemoDuration) * 100}%` }}
              />
            ))}
          </div>

          {/* Scene dots + controls */}
          <div className="flex items-center justify-between">
            {/* Scene navigation dots */}
            <div className="flex items-center gap-2">
              {scenes.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => seekToScene(i)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                    i === currentSceneIdx
                      ? 'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/25'
                      : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  {SCENE_ICONS[s.id]}
                  <span className="hidden sm:inline">{s.title}</span>
                </button>
              ))}
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/25 font-mono tabular-nums">
                {formatTime(elapsed)} / {formatTime(totalDemoDuration)}
              </span>
              <button
                onClick={isPlaying ? pause : play}
                className="w-7 h-7 rounded-lg bg-[#22c55e]/15 border border-[#22c55e]/25 flex items-center justify-center text-[#22c55e] hover:bg-[#22c55e]/25 transition-colors"
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
              </button>
              <button
                onClick={restart}
                className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/30 hover:text-white/50 hover:bg-white/[0.08] transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Closing CTA */}
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-center mt-4 text-[12px] text-white/30"
      >
        Lo que antes te tomaba horas, ahora lo haces en minutos.
      </motion.p>
    </div>
  );
}
