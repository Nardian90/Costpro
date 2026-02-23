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
    ChevronUp,
    Table2
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

/**
 * Repara JSON truncado balanceando llaves y corchetes.
 */
const repairJson = (jsonStr: string): any => {
    let stack: string[] = [];
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (char === '"' && !isEscaped) inString = !inString;
        if (!inString) {
            if (char === '{') stack.push('}');
            if (char === '[') stack.push(']');
            if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
            }
        }
        isEscaped = char === '\\' && !isEscaped;
    }

    let repaired = jsonStr;
    if (inString) repaired += '"';
    while (stack.length > 0) repaired += stack.pop();

    try {
        return JSON.parse(repaired);
    } catch (e) {
        try {
            // Intento final: quitar coma final antes de cerrar
            const fallback = repaired.replace(/,\s*[}\]]$/, (m) => m.slice(1));
            return JSON.parse(fallback);
        } catch (e2) {
            return null;
        }
    }
};

const AnnexPreview = ({ data, isDark }: { data: any, isDark: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    if (!data || !data.annexes) return null;

    return (
        <div className={cn(
            "mt-4 border rounded-2xl overflow-hidden shadow-sm",
            isDark ? "bg-black/40 border-white/10" : "bg-white border-slate-200"
        )}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 transition-colors border-b border-primary/5"
            >
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                        <Table2 className="w-4 h-4 text-primary" />
                    </div>
                    <span>Propuesta Técnica: {data.annexes.length} Anexos</span>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 space-y-6 bg-gradient-to-b from-transparent to-primary/5">
                            {data.annexes.map((annex: any, idx: number) => (
                                <div key={idx} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-primary text-primary-foreground text-[8px] font-black px-1.5 py-0.5 rounded">ANEXO {annex.id}</span>
                                        <p className="text-[10px] font-black uppercase tracking-tight opacity-80 truncate">
                                            {annex.title || 'Desglose de Costos'}
                                        </p>
                                    </div>
                                    <div className="space-y-1.5 pl-2 border-l-2 border-primary/20">
                                        {annex.data?.slice(0, 6).map((row: any, rIdx: number) => (
                                            <div key={rIdx} className="flex justify-between text-[11px] items-center">
                                                <span className="opacity-70 truncate max-w-[200px]">{row.description || row.label || row.concept || 'Item'}</span>
                                                <span className="font-bold text-primary">\$ {(row.total || row.amount || row.price_total || 0).toLocaleString()}</span>
                                            </div>
                                        ))}
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
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isLoading]);

    const extractUpdateData = (text: string) => {
        const match = text.match(/(\`\`\`json_annex_update|\`\`\`json)\s*([\s\S]*?)(\`\`\`|$)/);
        if (match && match[2]) {
            try { return JSON.parse(match[2].trim()); } catch (e) { return repairJson(match[2].trim()); }
        }
        const jsonMatch = text.match(/\{[\s\S]*/);
        if (jsonMatch) return repairJson(jsonMatch[0]);
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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ messages: newMessages, sheetData }),
            });

            if (!response.ok) throw new Error('Error en la comunicación con Darian');
            const data = await response.json();
            const content = data.text || data.content || '';
            const updateData = extractUpdateData(content);

            let clean = content.replace(/(\`\`\`json_annex_update|\`\`\`json)[\s\S]*?(\`\`\`|$)/g, '').trim();
            if (clean.includes('{')) clean = clean.split('{')[0].trim();

            setMessages([...newMessages, {
                role: 'assistant',
                content: clean || "He preparado una propuesta técnica detallada. Puedes revisarla y aplicarla a continuación.",
                updateData
            }]);
        } catch (error: any) {
            setMessages([...newMessages, { role: 'assistant', content: `Error: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplyUpdate = async (updateData: any, messageIndex: number) => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/cost-sheets/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ updateData, currentData: sheetData }),
            });
            if (!response.ok) throw new Error('Error al guardar');
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
                    <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center"><Bot className="w-6 h-6 text-primary" /></div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-primary">Darian AI</h2>
                        <div className="flex items-center gap-2 text-primary/70">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
                            <span className="text-[10px] font-bold uppercase tracking-tight">Experto en Costos</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-60">
                            <Sparkles className="w-10 h-10 text-primary animate-bounce" />
                            <p className="text-lg font-black uppercase">¿Qué vamos a calcular hoy?</p>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={cn("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}>
                                <div className={cn("max-w-[95%] p-4 rounded-2xl text-[13px] font-bold leading-relaxed shadow-sm", msg.role === 'user' ? "bg-primary text-primary-foreground" : (isDark ? "bg-[#0D141C] border border-white/5" : "bg-slate-100 border-slate-200"))}>
                                    <ReactMarkdown className="prose prose-sm dark:prose-invert">{msg.content}</ReactMarkdown>
                                    {msg.updateData && <AnnexPreview data={msg.updateData} isDark={isDark} />}
                                </div>
                                {msg.updateData && (
                                    <div className={cn("mt-2 w-full p-4 border rounded-2xl space-y-3 bg-primary/5", isDark ? "border-primary/20" : "border-primary/10")}>
                                        <p className="text-[10px] font-bold text-primary uppercase">{msg.hasSaved ? "¡Ficha persistida!" : "Propuesta Lista"}</p>
                                        {!msg.hasSaved ? (
                                            <button onClick={() => handleApplyUpdate(msg.updateData, i)} disabled={isSaving} className="w-full py-3 bg-primary text-primary-foreground font-black uppercase text-[10px] rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2">
                                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Aplicar y Guardar"}
                                            </button>
                                        ) : (
                                            <button onClick={() => onSectionChange?.('all-content')} className="w-full py-3 bg-primary/20 text-primary font-black uppercase text-[10px] rounded-xl border border-primary/30 active:scale-95 flex items-center justify-center gap-2">
                                                <ExternalLink className="w-3.5 h-3.5" /> Ver Ficha Completa
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    {isLoading && <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />}
                </div>

                <div className="p-6 bg-gradient-to-t from-transparent">
                    <div className="relative flex items-center gap-3">
                        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className={cn("w-full border-none text-sm py-4 pl-6 pr-12 rounded-2xl focus:ring-1 focus:ring-primary/50 shadow-lg", isDark ? "bg-[#0D141C] text-white" : "bg-slate-100 text-slate-900 border border-slate-200")} placeholder="Generar ficha de..." />
                        <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className="bg-primary text-primary-foreground w-14 h-14 rounded-2xl flex items-center justify-center active:scale-95"><SendHorizontal /></button>
                    </div>
                </div>
            </div>
        </div>
    );
};
