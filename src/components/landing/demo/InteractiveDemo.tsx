'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, FileText, Brain, Store, User, Volume2, VolumeX, Music } from 'lucide-react';
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

const SCENE_PREVIEW_COLORS: Record<string, string> = {
  'cost-sheet': 'from-green-500/20 to-emerald-500/5',
  'ipv': 'from-blue-500/20 to-cyan-500/5',
  'multi-store': 'from-purple-500/20 to-violet-500/5',
};

const SCENE_PREVIEW_ICONS: Record<string, React.ReactNode> = {
  'cost-sheet': <FileText className="w-5 h-5 text-green-400" />,
  'ipv': <Brain className="w-5 h-5 text-blue-400" />,
  'multi-store': <Store className="w-5 h-5 text-purple-400" />,
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
  const [showOverlay, setShowOverlay] = useState(true);
  // FIX-RCT-126: Initialize as false to avoid SSR hydration mismatch; sync from localStorage in useEffect
  const [isMuted, setIsMuted] = useState(false);
  const [isDemoEnded, setIsDemoEnded] = useState(false);

  // FIX-RCT-126: Sync muted state from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const stored = localStorage.getItem('costpro-demo-muted');
    if (stored === 'true') setIsMuted(true);
  }, []);

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioReadyRef = useRef(false);

  const scene = scenes[currentSceneIdx];
  const sceneElapsed = useMemo(() => Math.max(0, elapsed - scenes.slice(0, currentSceneIdx).reduce((s, sc) => s + sc.duration, 0)), [elapsed, currentSceneIdx]);
  const globalProgress = useMemo(() => Math.min(100, (elapsed / totalDemoDuration) * 100), [elapsed]);

  /* ── Audio helpers ── */
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/demo-audio.mp3');
      audioRef.current.preload = 'none';
      audioRef.current.loop = false;
      audioRef.current.volume = 0.3;
      audioRef.current.addEventListener('canplaythrough', () => {
        audioReadyRef.current = true;
      });
      audioRef.current.addEventListener('ended', () => {
        audioReadyRef.current = false;
      });
      audioRef.current.load();
    }
    return audioRef.current;
  }, []);

  const syncMute = useCallback((muted: boolean) => {
    const audio = getAudio();
    audio.muted = muted;
  }, [getAudio]);

  // Keep mute state synced
  useEffect(() => {
    syncMute(isMuted);
  }, [isMuted, syncMute]);

  /* ── Playback engine ── */
  const tickRef = useRef<(timestamp: number) => void>(() => {});
  useEffect(() => {
    tickRef.current = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setElapsed(prev => {
        const next = prev + delta;
        if (next >= totalDemoDuration) {
          setIsPlaying(false);
          setIsDemoEnded(true);
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

      rafRef.current = requestAnimationFrame(tickRef.current);
    };
  });

  const play = useCallback(() => {
    if (elapsed >= totalDemoDuration) {
      setElapsed(0);
      setCurrentSceneIdx(0);
      lastTimeRef.current = 0;
      setIsDemoEnded(false);
    }
    setIsPlaying(true);
    setShowOverlay(false);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tickRef.current);

    // Start audio
    const audio = getAudio();
    audio.muted = isMuted;
    if (audioReadyRef.current) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.currentTime = 0;
      const tryPlay = () => {
        audio.play().catch(() => {});
        audio.removeEventListener('canplaythrough', tryPlay);
      };
      audio.addEventListener('canplaythrough', tryPlay);
      audio.load();
    }
  }, [elapsed, getAudio, isMuted]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = 0;

    // Pause audio
    const audio = getAudio();
    if (!audio.paused) audio.pause();
  }, [getAudio]);

  const restart = useCallback(() => {
    pause();
    setElapsed(0);
    setCurrentSceneIdx(0);
    setIsDemoEnded(false);

    // Restart audio
    const audio = getAudio();
    audio.currentTime = 0;
    if (!isMuted && audioReadyRef.current) {
      audio.play().catch(() => {});
    }
  }, [pause, getAudio, isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      localStorage.setItem('costpro-demo-muted', String(next));
      return next;
    });
  }, []);

  const seekToScene = useCallback((idx: number) => {
    pause();
    const targetTime = scenes.slice(0, idx).reduce((s, sc) => s + sc.duration, 0);
    setElapsed(targetTime);
    setCurrentSceneIdx(idx);
  }, [pause]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  /* Pause when scrolled out of viewport */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isPlaying) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && isPlaying) pause();
      },
      { threshold: 0.2 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [isPlaying, pause]);

  /* ── Scene boundaries for dots ── */
  const sceneBoundaries = useMemo(() =>
    scenes.reduce<{ start: number; end: number }[]>((acc, s) => {
      const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
      acc.push({ start, end: start + s.duration });
      return acc;
    }, []), []);

  /* ── Overlay "Ver demo" ── */
  const OverlayContent = useMemo(() => (
    <motion.div
      key="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0a0f1a]/90 backdrop-blur-md"
    >
      {/* Animated play button */}
      <motion.button
        onClick={play}
        className="group relative mb-6 w-[72px] h-[72px] rounded-full bg-gradient-to-br from-[#22c55e]/20 to-emerald-500/10 border-2 border-[#22c55e]/40 flex items-center justify-center cursor-pointer hover:from-[#22c55e]/30 hover:to-emerald-500/20 hover:border-[#22c55e]/60 hover:shadow-[0_0_40px_rgba(34,197,94,0.25)] transition-all duration-300"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full border-2 border-[#22c55e]/30 animate-ping" style={{ animationDuration: '2s' }} />
        <Play className="w-7 h-7 text-[#22c55e] ml-1 group-hover:scale-110 transition-transform" fill="currentColor" />
      </motion.button>

      {/* Title */}
      <h4 className="text-white/90 text-sm sm:text-base font-semibold mb-1 font-[family-name:var(--font-space-grotesk)]">
        Mira cómo CostPro transforma tu negocio
      </h4>

      {/* Subtitle */}
      <p className="text-white/30 text-[11px] flex items-center gap-2 mb-5">
        <User className="w-3 h-3" />
        <span>Liannis, comercializadora en Cuba</span>
        <span className="text-white/15">|</span>
        <span>{formatTime(totalDemoDuration)}</span>
        <span className="text-white/15">|</span>
        <Music className="w-3 h-3 text-[#22c55e]/60" />
        <span className="text-[#22c55e]/50">con audio</span>
      </p>

      {/* Scene preview cards */}
      <div className="flex items-center gap-3">
        {scenes.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.35 }}
            className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.07] hover:border-white/[0.12] transition-all duration-200 cursor-default"
          >
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${SCENE_PREVIEW_COLORS[s.id]} flex items-center justify-center`}>
              {SCENE_PREVIEW_ICONS[s.id]}
            </div>
            <span className="text-[10px] text-white/40 font-medium">{s.title}</span>
            <span className="text-[9px] text-white/20">{s.subtitle.split(' ').slice(0, 3).join(' ')}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  ), [play]);

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
      </motion.div>

      {/* ── Player Frame ── */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0a0f1a] shadow-2xl shadow-black/40">
        {/* Scene viewport (16:9) */}
        <div className="relative aspect-video w-full overflow-hidden bg-[#0d1117]">
          {/* Static preview background when overlay is showing */}
          {showOverlay && (
            <div className="absolute inset-0 opacity-30">
              <div className="w-full h-full flex items-center justify-center p-8">
                <div className="w-full max-w-2xl rounded-xl border border-green-500/10 bg-[#111827]/60 transform scale-75">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5">
                    <div className="w-2 h-2 rounded-full bg-green-500/40" />
                    <span className="text-[10px] text-white/20">CostPro — Ficha de Costo · Res. 148/2023</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-40 bg-white/5 rounded" />
                    <div className="flex gap-1">
                      <div className="h-5 w-24 bg-green-500/10 rounded" />
                      <div className="h-5 w-20 bg-white/5 rounded" />
                    </div>
                    {[0.7, 1, 0.85, 0.6].map((w, i) => (
                      <div key={i} className="flex gap-2">
                        <div className="h-3.5 bg-white/5 rounded" style={{ width: `${w * 60}%` }} />
                        <div className="h-3.5 w-8 bg-white/5 rounded" />
                        <div className="h-3.5 w-8 bg-white/5 rounded" />
                        <div className="h-3.5 w-10 bg-green-500/5 rounded ml-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active scene */}
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

          {/* Mute button (floating top-right) */}
          {!showOverlay && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={toggleMute}
              className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-black/60 transition-all duration-200 cursor-pointer"
              title={isMuted ? 'Activar audio' : 'Silenciar audio'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </motion.button>
          )}

          {/* ── Overlay ── */}
          <AnimatePresence>
            {showOverlay && OverlayContent}
          </AnimatePresence>

          {/* ── Replay overlay (shown when demo ends) ── */}
          <AnimatePresence>
            {isDemoEnded && !showOverlay && (
              <motion.div
                key="replay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0a0f1a]/80 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="flex flex-col items-center gap-3"
                >
                  <p className="text-sm text-white/60 font-medium font-[family-name:var(--font-space-grotesk)]">
                    Lo que antes te tomaba horas, ahora lo haces en minutos.
                  </p>
                  <motion.button
                    onClick={restart}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#22c55e] text-sm font-medium hover:bg-[#22c55e]/25 hover:border-[#22c55e]/50 hover:shadow-[0_0_20px_rgba(34,197,94,0.15)] transition-all duration-300 cursor-pointer"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Ver de nuevo
                  </motion.button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Controls bar ── */}
        {!showOverlay && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="px-4 py-3 bg-[#111827]/95 backdrop-blur-sm border-t border-white/[0.06]"
          >
            {/* Progress bar */}
            <div role="slider" tabIndex={0} aria-label="Progreso de demo" aria-valuenow={Math.round((elapsed / totalDemoDuration) * 100)} aria-valuemin={0} aria-valuemax={100} className="w-full h-1 rounded-full bg-white/[0.06] mb-3 cursor-pointer group relative"
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
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
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
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                      i === currentSceneIdx
                        ? 'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/25'
                        : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    {SCENE_ICONS[s.id]}
                    <span className="hidden sm:inline">{s.title}</span>
                    <span className="sm:hidden">{s.title.split(' ')[0]}</span>
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
                  className="w-7 h-7 rounded-lg bg-[#22c55e]/15 border border-[#22c55e]/25 flex items-center justify-center text-[#22c55e] hover:bg-[#22c55e]/25 transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                </button>
                <button
                  onClick={restart}
                  className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/30 hover:text-white/50 hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Closing CTA — only show when demo hasn't ended yet (hint text) */}
      {!showOverlay && !isDemoEnded && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center mt-4 text-[12px] text-white/30"
        >
          Lo que antes te tomaba horas, ahora lo haces en minutos.
        </motion.p>
      )}
    </div>
  );
}
