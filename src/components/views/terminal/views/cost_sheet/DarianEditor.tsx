import React, { useState, useRef, useEffect } from 'react';
import { Bot, SendHorizontal, Loader2, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, isDarkTheme } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { useCostSheetStore, useAuthStore } from '@/store';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    updateData?: any;
    hasSaved?: boolean;
    error?: boolean;
}

interface DarianEditorProps {
    sheetData?: any;
    isFullView?: boolean;
    onToggleFullView?: () => void;
    onSectionChange?: (section: string) => void;
}

const AnnexPreview = ({ data, isDark }: { data: any, isDark: boolean }) => {
    if (!data || !data.annexes) return null;
    return (
        <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
                {data.annexes.map((annex: any, idx: number) => {
                    const items = annex.data || annex.items || [];
                    return (
                        <div key={idx} className={cn("p-3 rounded-xl border flex flex-col gap-2", isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200")}>
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 bg-primary/20 rounded-md flex items-center justify-center text-[10px] font-bold text-primary">
                                    {annex.id}
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-tight opacity-80 truncate">
                                    {annex.title || 'Desglose'}
                                </p>
                            </div>
                            <p className="text-[10px] font-bold text-primary">
                                {items.length} ítems propuestos
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const DarianEditor: React.FC<DarianEditorProps> = ({ sheetData, isFullView, onSectionChange }) => {
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

    const repairJson = (text: string) => {
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Failed to repair JSON", text);
            return null;
        }
    };

    const extractUpdateData = (text: string) => {
        // Try multiple markers including common markdown variations
        const markers = [/```json_annex_update\s*([\s\S]*?)```/, /```json\s*([\s\S]*?)```/, /```\s*([\s\S]*?)```/];

        for (const marker of markers) {
            const match = text.match(marker);
            if (match && match[1]) {
                const parsed = repairJson(match[1].trim());
                if (parsed) return parsed;
            }
        }

        // Fallback: search for first { and last }
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const possibleJson = text.substring(firstBrace, lastBrace + 1);
            return repairJson(possibleJson);
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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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

            let clean = content.replace(/(\`\`\`json_annex_update|\`\`\`json)[\s\S]*?(\`\`\`|$)/g, '').trim();
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
                                isDark ? "bg-[#0D141C] text-white placeholder:text-white/20" : "bg-white text-slate-900 border border-slate-200 shadow-slate-200/50"
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

export default DarianEditor;
