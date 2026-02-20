'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, MessageSquare, Loader2, Bot, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface CospiChatProps {
    sheetData: any;
    isFullView?: boolean;
    onToggleFullView?: () => void;
}

export const CospiChat: React.FC<CospiChatProps> = ({ sheetData, isFullView, onToggleFullView }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            const response = await fetch('/api/cost-sheets/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages,
                    sheetData
                }),
            });

            if (!response.ok) throw new Error('Error en la comunicación con Cospi');

            const data = await response.json();
            setMessages([...newMessages, { role: 'assistant', content: data.content }]);
        } catch (error: any) {
            setMessages([...newMessages, { role: 'assistant', content: `Lo siento, hubo un error: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={cn(
            "flex flex-col h-full overflow-hidden transition-all duration-500",
            isFullView ? "p-8" : "p-0"
        )}>
            {/* Header with name and toggle */}
            <div className={cn(
                "flex items-center justify-between mb-4 px-4 py-2 rounded-2xl",
                isDark ? "bg-white/5" : "bg-muted/50"
            )}>
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center border",
                        isDark ? "bg-[#39FF14]/10 border-[#39FF14]/20" : "bg-primary/10 border-primary/20"
                    )}>
                        <Bot className={cn("w-4 h-4", isDark ? "text-[#39FF14]" : "text-primary")} />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 leading-none mb-1">Cospi AI</h4>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-90">Asistente Inteligente</p>
                    </div>
                </div>
                {onToggleFullView && (
                    <button
                        onClick={onToggleFullView}
                        className={cn(
                            "p-2 rounded-xl transition-all active:scale-90",
                            isDark ? "hover:bg-white/10 text-white/50" : "hover:bg-primary/10 text-primary/50"
                        )}
                        title={isFullView ? "Vista Normal" : "Vista Completa"}
                    >
                        {isFullView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                )}
            </div>

            {/* Chat Area */}
            <div
                ref={scrollRef}
                className={cn(
                    "flex-1 overflow-y-auto space-y-4 no-scrollbar pr-2 transition-all duration-500",
                    isFullView ? "px-12" : "px-4"
                )}
            >
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-50">
                        <div className="w-16 h-16 rounded-3xl border-2 border-dashed border-current flex items-center justify-center">
                            <MessageSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">Inicia una consulta con Cospi</p>
                            <p className="text-[9px] font-medium max-w-[200px] mt-2 leading-relaxed uppercase tracking-tighter">
                                Pregúntame sobre la Resolución 148, márgenes de utilidad o cualquier duda técnica.
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                        <div className={cn(
                            "max-w-[90%] p-4 rounded-3xl text-xs font-bold shadow-xl break-words leading-relaxed",
                            msg.role === 'user'
                                ? (isDark ? "bg-[#39FF14] text-black rounded-tr-none" : "bg-primary text-white rounded-tr-none")
                                : (isDark ? "bg-white/5 border border-white/10 rounded-tl-none" : "bg-muted border border-border rounded-tl-none"),
                            isFullView && "text-sm max-w-[75%]"
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
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Cospi está pensando...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className={cn(
                "mt-4 transition-all duration-500",
                isFullView ? "px-12 pb-8" : "px-4 pb-4"
            )}>
                <div className={cn(
                    "flex items-center gap-2 p-2 rounded-[2rem] border transition-all shadow-inner",
                    isDark ? "bg-white/5 border-white/10 focus-within:border-[#39FF14]/50" : "bg-white border-border focus-within:border-primary/50"
                )}>
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Escribe tu consulta aquí..."
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
        </div>
    );
};
