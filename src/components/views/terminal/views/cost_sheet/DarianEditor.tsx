'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageSquare, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn, isDarkTheme } from '@/lib/utils';
import { useTheme } from 'next-themes';
import ReactMarkdown from 'react-markdown';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import reinicioTemplate from '@/lib/data/costpro-reinicio';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    updateData?: any;
}

interface DarianEditorProps {
    sheetData: any;
    isFullView?: boolean;
    onToggleFullView?: () => void;
}

export const DarianEditor: React.FC<DarianEditorProps> = ({ sheetData, isFullView, onToggleFullView }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { resolvedTheme } = useTheme();
    const isDark = isDarkTheme(resolvedTheme);
    const { setSheet } = useCostSheetStore();
    const { token } = useAuthStore();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const extractUpdateData = (text: string) => {
        const match = text.match(/```json_annex_update\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
            try {
                return JSON.parse(match[1]);
            } catch (e) {
                console.error("Error parsing AI update data:", e);
            }
        }
        return null;
    };

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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    messages: newMessages,
                    sheetData
                }),
            });

            if (!response.ok) throw new Error('Error en la comunicación con Darian');

            const data = await response.json();
            const assistantContent = data.text || data.content || '';

            const updateData = extractUpdateData(assistantContent);
            const cleanContent = assistantContent.replace(/```json_annex_update\s*[\s\S]*?\s*```/, '').trim();

            setMessages([...newMessages, {
                role: 'assistant',
                content: cleanContent || "He generado una propuesta para tu ficha de costo.",
                updateData
            }]);

        } catch (error: any) {
            setMessages([...newMessages, { role: 'assistant', content: `Lo siento, hubo un error: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplyUpdate = (updateData: any) => {
        try {
            // "Agent" behavior: Use reset template if resetBeforeApply is true
            let newData;
            if (updateData.resetBeforeApply) {
                newData = JSON.parse(JSON.stringify(reinicioTemplate));
            } else {
                newData = JSON.parse(JSON.stringify(sheetData));
            }

            if (updateData.annexes) {
                updateData.annexes.forEach((update: any) => {
                    const annex = newData.annexes.find((a: any) => a.id === update.id);
                    if (annex) annex.data = update.data;
                });
            }
            if (updateData.header) {
                newData.header = { ...newData.header, ...updateData.header };
            }
            setSheet(newData);
            toast.success(updateData.resetBeforeApply ? "¡Ficha reiniciada y actualizada con nuevos datos!" : "¡Ficha de costo actualizada!");
        } catch (error) {
            toast.error("No se pudo aplicar la actualización.");
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-280px)] min-h-[600px] overflow-hidden gap-6 px-4 pb-4">
            <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden max-w-5xl mx-auto w-full">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/10 bg-muted/10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Darian Assistant</span>
                    </div>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-40 space-y-4">
                             <div className="w-16 h-16 rounded-3xl border-2 border-dashed border-primary/30 flex items-center justify-center animate-pulse">
                                <MessageSquare className="w-6 h-6 text-primary" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-widest leading-relaxed">Pídeme generar una ficha técnica</p>
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div key={i} className={cn("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}>
                            <div className="flex items-center gap-2 px-1">
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40">{msg.role === 'assistant' ? 'Darian' : 'Usuario'}</span>
                            </div>
                            <div className={cn("max-w-[95%] p-4 rounded-2xl text-[13px] font-bold leading-relaxed shadow-sm", msg.role === 'user' ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted dark:bg-slate-800 text-foreground rounded-tl-none border border-border/50")}>
                                {msg.content}
                            </div>
                            {msg.updateData && (
                                <div className="mt-2 w-full p-4 bg-primary/10 border border-primary/30 rounded-2xl space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-primary/20 p-2 rounded-xl"><CheckCircle2 className="w-4 h-4 text-primary" /></div>
                                        <div>
                                            <p className="text-[11px] font-black uppercase tracking-tight text-primary">Propuesta Estructurada</p>
                                            <p className="text-[10px] font-bold opacity-80 uppercase leading-tight mt-1">He preparado datos para {msg.updateData.header?.productName || 'la ficha'}.</p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleApplyUpdate(msg.updateData)} className="w-full py-2 bg-primary text-black font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg active:scale-95 transition-all">Aplicar Cambios</button>
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex flex-col items-start gap-2">
                             <span className="text-[8px] font-black uppercase tracking-widest opacity-40 animate-pulse">Darian pensando...</span>
                             <div className="bg-muted dark:bg-slate-800 p-4 rounded-2xl border border-border/50"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-muted/10 border-t border-border/5">
                    <div className="flex items-center gap-2 p-2 rounded-2xl bg-white dark:bg-slate-800 border border-border/50 focus-within:border-primary/50 shadow-inner">
                        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Generar ficha de..." className="flex-1 bg-transparent border-none px-4 py-2 text-xs font-bold outline-none placeholder:opacity-30" />
                        <button onClick={handleSend} disabled={!input.trim() || isLoading} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg active:scale-90 disabled:opacity-30"><Send className="w-5 h-5" /></button>
                    </div>
                </div>
            </div>
        </div>
    );
};
