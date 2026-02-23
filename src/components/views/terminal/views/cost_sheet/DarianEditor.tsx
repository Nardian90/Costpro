'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send,
    MessageSquare,
    Loader2,
    Sparkles,
    CheckCircle2,
    Menu,
    Wand2,
    Paperclip,
    SendHorizontal,
    ArrowRight,
    Bot,
    FileText,
    BarChart3,
    Search,
    ExternalLink,
    ChevronDown,
    ChevronUp, Table2
} from 'lucide-react';
import { cn, isDarkTheme } from '@/lib/utils';
import { useTheme } from 'next-themes';
import ReactMarkdown from 'react-markdown';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    updateData?: any;
    hasSaved?: boolean;
}

interface DarianEditorProps {
    sheetData: any;
    isFullView?: boolean;
    onToggleFullView?: () => void;
    onSectionChange?: (section: string) => void;
}

const AnnexPreview = ({ data, isDark }: { data: any, isDark: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    if (!data || !data.annexes) return null;

    return (
        <div className={cn(
            "mt-2 border rounded-xl overflow-hidden",
            isDark ? "bg-black/20 border-white/10" : "bg-white/50 border-slate-200"
        )}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-3 flex items-center justify-between text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Table2 className="w-3.5 h-3.5 text-primary" />
                    <span>Resumen de Anexos Propuestos ({data.annexes.length})</span>
                </div>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 pt-0 space-y-4">
                            {data.annexes.map((annex: any, idx: number) => (
                                <div key={idx} className="space-y-1.5">
                                    <p className="text-[9px] font-black text-primary opacity-70 uppercase tracking-tighter">
                                        Anexo {annex.id}: {annex.title || 'Desglose'}
                                    </p>
                                    <div className="space-y-1">
                                        {annex.data?.slice(0, 5).map((row: any, rIdx: number) => (
                                            <div key={rIdx} className="flex justify-between text-[10px] border-b border-primary/5 pb-1">
                                                <span className="opacity-70 truncate max-w-[150px]">{row.description || row.label || row.concept || 'Item'}</span>
                                                <span className="font-bold">$ {(row.total || row.amount || row.price_total || 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                        {annex.data?.length > 5 && (
                                            <p className="text-[8px] italic opacity-50 text-center pt-1">+ {annex.data.length - 5} elementos más</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const DarianEditor: React.FC<DarianEditorProps> = ({ sheetData, isFullView, onToggleFullView, onSectionChange }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
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
        const match = text.match(/\`\`\`json_annex_update\s*([\s\S]*?)\s*\`\`\`/);
        if (match && match[1]) {
            try {
                return JSON.parse(match[1]);
            } catch (e) {
                console.error("Error parsing AI update data:", e);
            }
        }
        return null;
    };

    const handleSend = async (text?: string) => {
        const messageToSend = typeof text === 'string' ? text : input.trim();
        if (!messageToSend || isLoading) return;

        setInput('');
        const newMessages: Message[] = [...messages, { role: 'user', content: messageToSend }];
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
            const cleanContent = assistantContent.replace(/\`\`\`json_annex_update\s*[\s\S]*?\`\`\`/, '').trim();

            setMessages([...newMessages, {
                role: 'assistant',
                content: cleanContent || "He preparado una propuesta para tu ficha de costo.",
                updateData
            }]);

        } catch (error: any) {
            setMessages([...newMessages, { role: 'assistant', content: `Lo siento, hubo un error: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplyUpdate = async (updateData: any, messageIndex: number) => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/cost-sheets/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    updateData,
                    currentData: sheetData
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al guardar la ficha');
            }

            const result = await response.json();
            setSheet(result.data);

            // Mark this specific message as saved
            setMessages(prev => prev.map((msg, i) =>
                i === messageIndex ? { ...msg, hasSaved: true } : msg
            ));

            toast.success("¡Ficha generada, calculada y persistida!");
        } catch (error: any) {
            console.error('Save Error:', error);
            toast.error("Error al persistir la ficha: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const suggestions = [
        { icon: <FileText className="w-3.5 h-3.5" />, label: "Generar PDF" },
        { icon: <BarChart3 className="w-3.5 h-3.5" />, label: "Reporte Costos" },
        { icon: <Search className="w-3.5 h-3.5" />, label: "Analizar" },
    ];

    return (
        <div className={cn(
            "flex flex-col h-full bg-background rounded-3xl border shadow-2xl overflow-hidden",
            isDark ? "border-white/5" : "border-slate-200"
        )}>
            {/* Header from Stitch */}
            <div className={cn(
                "p-6 flex items-center justify-between border-b",
                isDark ? "bg-[#0D141C] border-white/5" : "bg-slate-50 border-slate-200"
            )}>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center">
                            <Bot className="w-6 h-6 text-primary" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary border-4 border-[#0D141C] rounded-full animate-pulse"></div>
                    </div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest">Darian Assistant</h2>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
                            <span className="text-[10px] font-bold opacity-50 uppercase tracking-tight">Experto en Costos • Online</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onToggleFullView}
                        className={cn(
                            "p-3 rounded-xl transition-all hover:scale-105 active:scale-95",
                            isDark ? "bg-white/5 hover:bg-white/10" : "bg-slate-200 hover:bg-slate-300"
                        )}
                    >
                        <Wand2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth no-scrollbar"
                >
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-60">
                            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center animate-bounce">
                                <Sparkles className="w-10 h-10 text-primary" />
                            </div>
                            <div className="max-w-xs">
                                <p className="text-lg font-black uppercase tracking-tight">¿Qué vamos a calcular hoy?</p>
                                <p className="text-[11px] font-medium">Genera fichas técnicas, presupuestos o analiza documentos en segundos.</p>
                            </div>

                            {/* Suggestion Card with Wave Animation */}
                            <button
                                onClick={() => handleSend("Pídeme generar una ficha técnica")}
                                className={cn(
                                    "group relative w-full max-w-sm p-8 rounded-2xl border border-white/5 overflow-hidden transition-all duration-300 hover:border-primary/50 text-left",
                                    isDark ? "bg-[#0D141C]" : "bg-slate-50 shadow-lg"
                                )}
                            >
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="text-[10px] font-black text-primary tracking-widest uppercase bg-primary/10 px-2 py-1 rounded">Sugerencia</span>
                                        <div className="flex gap-1">
                                            <div className="w-1 h-3 bg-primary/40 rounded-full animate-darian-wave" style={{ animationDelay: '0s' }}></div>
                                            <div className="w-1 h-5 bg-primary/60 rounded-full animate-darian-wave" style={{ animationDelay: '0.2s' }}></div>
                                            <div className="w-1 h-4 bg-primary rounded-full animate-darian-wave" style={{ animationDelay: '0.4s' }}></div>
                                            <div className="w-1 h-2 bg-primary/50 rounded-full animate-darian-wave" style={{ animationDelay: '0.1s' }}></div>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-black leading-tight uppercase tracking-tight">Pídeme generar una ficha técnica</h3>
                                    <div className="mt-4 flex items-center text-primary text-xs font-black uppercase tracking-widest gap-2">
                                        Comenzar ahora
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            </button>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={cn("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}>
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[8px] font-black uppercase tracking-widest opacity-40">
                                        {msg.role === 'assistant' ? 'Darian' : 'Usuario'}
                                    </span>
                                </div>
                                <div className={cn(
                                    "max-w-[95%] p-4 rounded-2xl text-[13px] font-bold leading-relaxed shadow-sm",
                                    msg.role === 'user'
                                        ? "bg-primary text-primary-foreground rounded-tr-none"
                                        : (isDark ? "bg-[#0D141C] border border-white/5" : "bg-slate-100 border border-slate-200") + " rounded-tl-none"
                                )}>
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <ReactMarkdown>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>

                                    {msg.updateData && <AnnexPreview data={msg.updateData} isDark={isDark} />}
                                </div>
                                {msg.updateData && (
                                    <div className={cn(
                                        "mt-2 w-full p-4 border rounded-2xl space-y-3",
                                        isDark ? "bg-primary/5 border-primary/20" : "bg-primary/5 border-primary/10"
                                    )}>
                                        <div className="flex items-start gap-3">
                                            <div className="bg-primary/20 p-2 rounded-xl"><CheckCircle2 className="w-4 h-4 text-primary" /></div>
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-tight text-primary">Propuesta Estructurada</p>
                                                <p className="text-[10px] font-bold opacity-80 uppercase leading-tight mt-1">
                                                    {msg.hasSaved ? "¡Ficha persistida con éxito!" : `He preparado datos para ${msg.updateData.header?.productName || 'la ficha'}.`}
                                                </p>
                                            </div>
                                        </div>

                                        {!msg.hasSaved ? (
                                            <button
                                                onClick={() => handleApplyUpdate(msg.updateData, i)}
                                                disabled={isSaving}
                                                className="w-full py-3 bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                            >
                                                {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                                                {isSaving ? "Guardando..." : "Generar y Persistir"}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => onSectionChange?.('main')}
                                                className="w-full py-3 bg-primary/20 text-primary font-black uppercase tracking-widest text-[10px] rounded-xl border border-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                Ver Ficha Generada
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    {isLoading && (
                        <div className="flex flex-col items-start gap-2">
                             <span className="text-[8px] font-black uppercase tracking-widest opacity-40 animate-pulse">Darian pensando...</span>
                             <div className={cn(
                                 "p-4 rounded-2xl border",
                                 isDark ? "bg-[#0D141C] border-white/5" : "bg-slate-100 border-slate-200"
                             )}>
                                 <Loader2 className="w-4 h-4 animate-spin text-primary" />
                             </div>
                        </div>
                    )}
                </div>

                {/* Input Area from Stitch */}
                <div className={cn(
                    "p-6 bg-gradient-to-t from-transparent",
                    isDark ? "to-[#05080A]" : "to-white"
                )}>
                    <div className="relative flex items-center gap-3">
                        <div className="relative flex-1 group">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                className={cn(
                                    "w-full border-none text-sm py-4 pl-6 pr-12 rounded-2xl focus:ring-1 focus:ring-primary/50 transition-all placeholder:opacity-30 shadow-lg",
                                    isDark ? "bg-[#0D141C] text-white" : "bg-slate-100 text-slate-900"
                                )}
                                placeholder="Generar ficha de..."
                                type="text"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <Paperclip className="w-5 h-5 text-slate-400 cursor-pointer hover:text-primary transition-colors" />
                            </div>
                        </div>
                        <button
                            onClick={() => handleSend()}
                            disabled={!input.trim() || isLoading}
                            className="bg-primary text-primary-foreground w-14 h-14 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-95 transition-all disabled:opacity-30"
                        >
                            <SendHorizontal className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Quick Action Pills */}
                    <div className="flex gap-3 mt-4 overflow-x-auto no-scrollbar pb-2">
                        {suggestions.map((s, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSend(s.label)}
                                className={cn(
                                    "whitespace-nowrap px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all hover:border-primary/50 hover:bg-primary/5",
                                    isDark ? "border-white/5 bg-[#0D141C] text-slate-400" : "border-slate-200 bg-white text-slate-600 shadow-sm"
                                )}
                            >
                                {s.icon}
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mobile Handle Indicator */}
                {!isFullView && (
                    <div className={cn(
                        "w-12 h-1.5 rounded-full mx-auto mb-4 opacity-20",
                        isDark ? "bg-slate-700" : "bg-slate-300"
                    )}></div>
                )}
            </div>
        </div>
    );
};
