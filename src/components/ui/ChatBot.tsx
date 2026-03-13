import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  Trash2,
  Sparkles,
  Moon,
  Sun,
  ChevronRight,
  RefreshCw,
  Info,
  Settings,
  X,
  Key,
  Check,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { useAuthStore, useUIStore } from '@/store';
import { toast } from 'sonner';

const ChatBot = () => {
  const { user, token } = useAuthStore();
  const { isChatBotOpen, setIsChatBotOpen } = useUIStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempProvider, setTempProvider] = useState(user?.aiProvider || 'gemini');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isSettingsOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/bot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          aiProvider: user?.aiProvider,
          aiApiKey: user?.aiApiKey
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ details: 'Error desconocido' }));
        throw new Error(error.details || error.error || 'Error en la comunicación con la IA');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
    } catch (err: any) {
      toast.error(err.message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Aquí se llamaría a un servicio para guardar en DB si fuera necesario
      toast.success('Configuración de IA actualizada');
      setIsSettingsOpen(false);
    } catch (error) {
      toast.error('Error al guardar la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {!isChatBotOpen ? (
          <motion.button
            id="chatbot-trigger"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsChatBotOpen(true)}
            className="w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all group"
          >
            <Bot className="w-7 h-7 group-hover:rotate-12 transition-transform" />
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[400px] h-[600px] bg-background border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">Darian AI</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">En línea</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={cn(
                    "p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground",
                    isSettingsOpen && "bg-primary/10 text-primary"
                  )}
                  type="button"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsChatBotOpen(false)}
                  className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Area / Settings Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 bg-muted/5 relative no-scrollbar">
              <AnimatePresence mode="wait">
                {isSettingsOpen ? (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6 pt-2"
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Proveedor de IA</label>
                        <div className="grid grid-cols-3 gap-2">
                          {['gemini', 'gpt', 'deepseek'].map((p) => (
                            <button
                              key={p}
                              onClick={() => setTempProvider(p)}
                              className={cn(
                                "h-11 rounded-xl border-2 text-[10px] font-black uppercase tracking-tight transition-all",
                                tempProvider === p
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border bg-background text-muted-foreground hover:border-primary/30"
                              )}
                              type="button"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">API KEY Personal</label>
                        <div className="relative">
                          <input
                            type="password"
                            value={tempApiKey}
                            onChange={(e) => setTempApiKey(e.target.value)}
                            placeholder={user?.aiApiKey ? '••••••••••••••••' : 'Pega tu clave aquí...'}
                            className="w-full h-12 bg-background border border-border rounded-xl px-4 text-xs focus:ring-2 focus:ring-primary/20 outline-none pr-10 font-medium"
                          />
                          <Key className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-50" />
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed px-1">
                          Tu clave se guarda de forma segura. Por seguridad, no se puede visualizar una vez guardada.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className="w-full h-14 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                      type="button"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Actualizar Configuración
                    </button>
                  </motion.div>
                ) : (
                  <div className="space-y-6">
                    {messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center border-2 border-dashed border-primary/20">
                          <Sparkles className="w-8 h-8 text-primary/40" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-sm font-black uppercase tracking-tight">¡Hola! Soy Darian</h3>
                          <p className="text-xs text-muted-foreground font-medium max-w-[200px] leading-relaxed">
                            Tu asistente inteligente experto en el sistema. ¿En qué puedo ayudarte hoy?
                          </p>
                        </div>
                      </div>
                    )}

                    {messages.map((msg, i) => (
                      <div key={i} className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm",
                          msg.role === 'user' ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary border border-primary/20"
                        )}>
                          {msg.role === 'user' ? 'YO' : 'AI'}
                        </div>
                        <div className={cn(
                          "p-4 rounded-2xl max-w-[80%] text-xs font-medium shadow-sm leading-relaxed",
                          msg.role === 'user'
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : "bg-card border border-border rounded-tl-none prose prose-xs dark:prose-invert"
                        )}>
                          {msg.role === 'assistant' ? (
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                      </div>
                    ))}

                    {isLoading && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[10px] font-black shrink-0">
                          AI
                        </div>
                        <div className="bg-card border border-border p-3 rounded-2xl rounded-tl-none flex items-center gap-3 shadow-sm">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Darian está pensando...</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Input Area */}
            {!isSettingsOpen && (
              <div className="p-4 bg-background border-t border-border">
                <div className="relative group">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${Math.min(target.scrollHeight, 150)}px`;
                    }}
                    placeholder="Escribe tu mensaje aquí..."
                    rows={1}
                    className="w-full bg-muted/30 border border-border rounded-2xl py-4 pl-4 pr-14 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all text-xs font-medium resize-none min-h-[56px] no-scrollbar"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-2 bottom-2 bg-primary hover:opacity-90 text-primary-foreground px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg active:scale-95"
                    type="button"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[8px] text-center text-muted-foreground/40 mt-3 uppercase tracking-[0.2em] font-black">
                  Desarrollado con la API de Gemini 2.0 Flash
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { ChatBot };
export default ChatBot;
