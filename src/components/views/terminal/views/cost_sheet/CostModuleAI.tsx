'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Bot, X, Send, Minus, Sparkles, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CostModuleAIProps {
    sheetData: any;
}

export const CostModuleAI: React.FC<CostModuleAIProps> = ({ sheetData }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [isMinimized, setIsMinimized] = useState(true);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { user, token } = useAuthStore();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const constraintsRef = useRef(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', content: input };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/cost-sheets/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    messages: newMessages,
                    sheetData,
                    aiProvider: user?.aiProvider,
                    aiApiKey: user?.aiApiKey
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al conectar con el asistente');
            }

            const data = await response.json();
            setMessages([...newMessages, { role: 'assistant', content: data.text }]);
        } catch (error: any) {
            toast.error(error.message);
            setMessages([...newMessages, { role: 'assistant', content: `Lo siento, hubo un error: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const containerVariants: Variants = {
        closed: { opacity: 0, scale: 0.8, y: 20 },
        open: { opacity: 1, scale: 1, y: 0 }
    };

    if (!isOpen) return (
        <button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-24 right-8 z-[9999] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
        >
            <Sparkles className="w-6 h-6" />
        </button>
    );

    return (
        <div ref={constraintsRef} className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
            <AnimatePresence>
                {isMinimized ? (
                    <motion.button
                        layoutId="ai-widget"
                        onClick={() => setIsMinimized(false)}
                        className={cn(
                            "absolute bottom-24 right-8 pointer-events-auto w-16 h-16 rounded-2xl shadow-2xl flex items-center justify-center group overflow-hidden border transition-all",
                            isDark ? "bg-[#010203] border-[#39FF14]/30" : "bg-white border-primary/30"
                        )}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <div className={cn(
                            "absolute inset-0 opacity-20 bg-gradient-to-br",
                            isDark ? "from-[#39FF14] to-transparent" : "from-primary to-transparent"
                        )} />
                        <Bot className={cn("w-8 h-8 relative z-10", isDark ? "text-[#39FF14]" : "text-primary")} />
                        <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
                    </motion.button>
                ) : (
                    <motion.div
                        layoutId="ai-widget"
                        drag
                        dragConstraints={constraintsRef}
                        dragElastic={0.1}
                        dragMomentum={false}
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={containerVariants}
                        className={cn(
                            "absolute top-24 right-12 w-full max-w-[380px] h-[550px] rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden border flex flex-col pointer-events-auto",
                            isDark ? "bg-[#010203]/95 border-[#39FF14]/30 text-white" : "bg-white/95 border-primary/30 text-foreground"
                        )}
                    >
                        {/* Header */}
                        <div className={cn(
                            "p-5 flex items-center justify-between border-b cursor-move active:cursor-grabbing",
                            isDark ? "bg-white/5 border-white/10" : "bg-muted/50 border-border/50"
                        )}>
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-2xl flex items-center justify-center border",
                                    isDark ? "bg-[#39FF14]/10 border-[#39FF14]/20" : "bg-primary/10 border-primary/20"
                                )}>
                                    <Sparkles className={cn("w-5 h-5", isDark ? "text-[#39FF14]" : "text-primary")} />
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 leading-none mb-1">CostPro AI</h4>
                                    <p className="text-xs font-black uppercase tracking-widest opacity-90">Asistente de Ficha</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setIsMinimized(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                    <Minus className="w-4 h-4" />
                                </button>
                                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Chat Area */}
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar">
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-50">
                                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                                        <MessageSquare className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-widest">Inicia una consulta</p>
                                        <p className="text-[10px] font-medium max-w-[200px] mt-2 leading-relaxed">
                                            Pregúntame sobre la Resolución 148, cálculos de utilidad o inconsistencias en tu ficha actual.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div key={i} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                    <div className={cn(
                                        "max-w-[85%] p-4 rounded-3xl text-xs font-bold shadow-xl break-words leading-relaxed",
                                        msg.role === 'user'
                                            ? (isDark ? "bg-[#39FF14] text-black rounded-tr-none" : "bg-primary text-white rounded-tr-none")
                                            : (isDark ? "bg-white/5 border border-white/10 rounded-tl-none" : "bg-muted border border-border rounded-tl-none")
                                    )}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className={cn(
                                        "p-4 rounded-3xl rounded-tl-none flex items-center gap-3 border shadow-lg",
                                        isDark ? "bg-white/5 border-white/10" : "bg-muted border-border"
                                    )}>
                                        <Loader2 className={cn("w-4 h-4 animate-spin", isDark ? "text-[#39FF14]" : "text-primary")} />
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Consultando Normativa...</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className={cn(
                            "p-5 border-t",
                            isDark ? "bg-black/20 border-white/10" : "bg-slate-50 border-border"
                        )}>
                            <div className={cn(
                                "flex items-center gap-2 p-2 rounded-3xl border transition-all shadow-inner",
                                isDark ? "bg-white/5 border-white/10 focus-within:border-[#39FF14]/50" : "bg-white border-border focus-within:border-primary/50"
                            )}>
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Consultar resolución o cálculos..."
                                    className="flex-1 bg-transparent border-none px-4 py-2 text-xs font-bold outline-none placeholder:opacity-30"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    className={cn(
                                        "w-10 h-10 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-90 disabled:opacity-30 disabled:grayscale",
                                        isDark ? "bg-[#39FF14] text-black shadow-[#39FF14]/20" : "bg-primary text-white shadow-primary/20"
                                    )}
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
