import React, { useState, useRef, useEffect } from 'react';
import { Bot, SendHorizontal, RefreshCw, Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    updateData?: any;
    error?: boolean;
    hasSaved?: boolean;
}

export interface DarianEditorProps {
    sheetData: any;
    setSheet?: (data: any) => void;
    onSectionChange?: (sectionId: string) => void;
    isDark?: boolean;
    isFullView?: boolean;
    onToggleFullView?: () => void;
}

const extractUpdateData = (text: string) => {
    try {
        const match = text.match(/(```json_annex_update|```json)([\s\S]*?)(```|$)/);
        if (match) {
            const jsonStr = match[2].trim();
            return JSON.parse(jsonStr);
        }
    } catch (e) {
        console.error("JSON Parse Error:", e);
    }
    return null;
};

const AnnexPreview = ({ data, isDark }: { data: any, isDark?: boolean }) => {
    if (!data) return null;
    return (
        <div className={cn("mt-4 p-4 rounded-xl border space-y-3 bg-card", isDark ? "border-white/5" : "border-slate-200")}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Resumen de Propuesta</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase">v1.0</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {Object.entries(data).map(([key, items]: [string, any]) => (
                    <div key={key} className="p-2 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-[8px] font-black uppercase text-primary mb-1">Anexo {key}</p>
                        <p className="text-xs font-bold">{items.length} Items</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const DarianEditor = ({ sheetData, setSheet, onSectionChange, isDark, isFullView, onToggleFullView }: DarianEditorProps) => {
    const { token } = useAuthStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const newMessages: Message[] = [...messages, { role: 'user', content: input }];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch('/api/cost-sheets/ai/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                    sheetData
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Error en la comunicación con Darian');
            }

            const content = data.text || data.content || '';
            const updateData = extractUpdateData(content);

            let clean = content.replace(/(```json_annex_update|```json)[\s\S]*?(```|$)/g, '').trim();
            if (clean.includes('{')) clean = clean.split('{')[0].trim();

            setMessages([...newMessages, {
                role: 'assistant',
                content: clean || "He preparado una propuesta técnica detallada. Puedes revisarla y aplicarla a continuación.",
                updateData
            }]);
        } catch (error: any) {
            console.error("Darian Chat Error:", error);
            setMessages([...newMessages, {
                role: 'assistant',
                content: `Error: ${error.message}`,
                error: true
            }]);
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplyUpdate = async (updateData: any, messageIndex: number) => {
        if (!setSheet) {
            toast.error("Error: No se puede actualizar la ficha en este modo");
            return;
        }
        setIsSaving(true);
        try {
            const response = await fetch('/api/cost-sheets/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ updateData, currentData: sheetData }),
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Error al guardar');
            }
            const result = await response.json();
            setSheet(result.data);
            setMessages(prev => prev.map((msg, i) => i === messageIndex ? { ...msg, hasSaved: true } : msg));
            toast.success("¡Ficha persistida!");
        } catch (error: any) {
            toast.error("Error: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={cn("flex flex-col h-full bg-background rounded-3xl border shadow-2xl overflow-hidden", isDark ? "border-white/5" : "border-slate-200")}>
            <div className={cn("p-6 flex items-center justify-between border-b", isDark ? "bg-[#0D141C] border-white/5" : "bg-slate-50 border-slate-200")}>
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/20 shadow-inner">
                        <Bot className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-primary">Darian AI</h2>
                        <div className="flex items-center gap-2 text-primary/70">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
                            <span className="text-[10px] font-bold uppercase tracking-tight">Experto en Costos</span>
                        </div>
                    </div>
                </div>
                {messages.length > 0 && (
                    <button
                        onClick={() => setMessages([])}
                        className="p-2 hover:bg-primary/10 rounded-xl transition-colors text-muted-foreground hover:text-primary"
                        title="Limpiar chat"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative">
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar scroll-smooth">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-60">
                            <div className="relative">
                                <Sparkles className="w-12 h-12 text-primary animate-pulse" />
                                <div className="absolute inset-0 blur-2xl bg-primary/20 -z-10"></div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-lg font-black uppercase tracking-tighter">¿Qué vamos a calcular hoy?</p>
                                <p className="text-[10px] uppercase font-bold tracking-widest opacity-70">Describe el producto o servicio para generar una propuesta</p>
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={i}
                                className={cn("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}
                            >
                                <div className={cn(
                                    "max-w-[95%] p-4 rounded-2xl text-[13px] font-medium leading-relaxed shadow-sm",
                                    msg.role === 'user'
                                        ? "bg-primary text-primary-foreground"
                                        : (isDark ? "bg-[#0D141C] border border-white/5" : "bg-slate-100 border-slate-200"),
                                    msg.error && "border-destructive/50 bg-destructive/10 text-destructive font-bold"
                                )}>
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    </div>
                                    {msg.updateData && <AnnexPreview data={msg.updateData} isDark={isDark} />}
                                </div>
                                {msg.updateData && (
                                    <div className={cn("mt-2 w-full p-4 border rounded-2xl space-y-3 bg-primary/5", isDark ? "border-primary/20" : "border-primary/10")}>
                                        <p className="text-[10px] font-bold text-primary uppercase">{msg.hasSaved ? "¡Ficha persistida!" : "Propuesta Lista"}</p>
                                        {!msg.hasSaved ? (
                                            <button onClick={() => handleApplyUpdate(msg.updateData, i)} disabled={isSaving} className="w-full py-3 bg-primary text-primary-foreground font-black uppercase text-[10px] rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Aplicar y Guardar"}
                                            </button>
                                        ) : (
                                            <button onClick={() => onSectionChange?.('all-content')} className="w-full py-3 bg-primary/20 text-primary font-black uppercase text-[10px] rounded-xl border border-primary/30 active:scale-95 flex items-center justify-center gap-2">
                                                <ExternalLink className="w-3.5 h-3.5" /> Ver Ficha Completa
                                            </button>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        ))
                    )}
                    {isLoading && (
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10 w-fit">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Darian está pensando...</span>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gradient-to-t from-background to-transparent pt-10">
                    <div className="relative flex items-center gap-3">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            className={cn(
                                "w-full border-none text-sm py-4 pl-6 pr-12 rounded-2xl focus:ring-2 focus:ring-primary/50 shadow-xl transition-all",
                                isDark ? "bg-[#0D141C] text-foreground placeholder:text-white/20" : "bg-background text-slate-900 border border-slate-200 shadow-slate-200/50"
                            )}
                            placeholder="Ej: Generar ficha para 1kg de azúcar blanca..."
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={!input.trim() || isLoading}
                            className="bg-primary text-primary-foreground w-14 h-14 rounded-2xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg shadow-primary/20"
                        >
                            <SendHorizontal className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
