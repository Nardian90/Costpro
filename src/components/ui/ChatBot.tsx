'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Bot, Loader2, Sparkles, Settings, Key, Check, Info } from 'lucide-react';
import { useAuthStore, useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { userService } from '@/services/user-service';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: any;
  tool_calls?: any[];
}

export function ChatBot() {
  const router = useRouter();
  const { isChatBotOpen: isOpen, setIsChatBotOpen: setIsOpen, currentView } = useUIStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastMetadata, setLastMetadata] = useState<any>(null);

  // Settings state
  const { user, token, updateUser } = useAuthStore();
  const [tempProvider, setTempProvider] = useState(user?.aiProvider || 'gemini');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Cargar mensajes locales al iniciar
  useEffect(() => {
    const savedMessages = localStorage.getItem('darian_chat_history');
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error('Error al cargar historial de chat:', e);
      }
    }
  }, []);

  // Guardar mensajes locales cuando cambian
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('darian_chat_history', JSON.stringify(messages.slice(-10)));
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ESC KEY HANDLER
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  const handleAction = (action: any) => {
    switch (action.type) {
      case 'navigation':
        toast.info(`Navegando a ${action.payload.route}...`);
        router.push(action.payload.route);
        break;

      case 'form_fill':
        toast.success(`Formulario ${action.payload.formName} completado por Darian`);
        window.dispatchEvent(new CustomEvent('ai:fill-form', { detail: action.payload }));
        break;

      case 'export':
        toast.success(`Archivo ${action.payload.type.toUpperCase()} listo para descargar`);
        break;

      case 'ui_mode':
        toast.info(`Cambiando a modo ${action.payload.mode}`);
        break;

      default:
        console.warn('Acción AI desconocida:', action.type);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    const currentInput = input.trim();
    const userMessage: Message = { role: 'user', content: currentInput };
    const newMessages = [...messages, userMessage].slice(-10);

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('/api/bot/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: newMessages,
          history: chatHistory,
          storeId: user.activeStoreId,
          aiProvider: user.aiProvider,
          aiApiKey: user.aiApiKey,
          botContext: {
            currentView,
            uiMode: 'standard'
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al conectar con Darian');
      }

      const data = await response.json();
      setMessages([...newMessages, { role: 'assistant', content: data.text, metadata: data.metadata }]);
      setLastMetadata(data.metadata);

      if (data.metadata?.actions) {
        data.metadata.actions.forEach(handleAction);
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[Chat] Request cancelled by user');
        return;
      }

      const errorMsg = error.message || '';
      const isFallbackError = errorMsg.includes('Todos los proveedores fallaron') ||
                             errorMsg.includes('No hay proveedores configurados');

      if (isFallbackError) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠️ La cuota global de la Inteligencia Artificial está agotada o los proveedores no responden. Por favor, ingresa tu clave API personal en los ajustes (icono de engranaje arriba) para continuar chateando sin límites.'
        }]);
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    setChatHistory([]);
    toast.success('Historial de chat borrado');
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await userService.updateAISettings(
        user.id,
        tempProvider,
        tempApiKey || user.aiApiKey || ''
      );
      updateUser({ aiProvider: tempProvider, aiApiKey: tempApiKey || user.aiApiKey });
      toast.success('Configuración de IA actualizada');
      setIsSettingsOpen(false);
      setTempApiKey('');
    } catch (error: any) {
      toast.error('Error al guardar configuración: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseChat = () => setIsOpen(false);

  const isConfigured = !!(user?.aiApiKey || true); // Allow always for system fallback

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="w-16 h-16 bg-primary text-primary-foreground rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all pointer-events-auto group relative"
            aria-label="Abrir asistente AI"
          >
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping pointer-events-none" />
            <MessageSquare className="w-8 h-8 relative z-10" />
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-background flex items-center justify-center">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            className="w-[400px] h-[600px] max-h-[85vh] bg-background border border-border shadow-2xl rounded-3xl flex flex-col overflow-hidden pointer-events-auto"
          >
            {/* Header */}
            <div className="p-4 bg-primary text-primary-foreground flex items-center justify-between shrink-0 relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary-foreground/10" />

              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors relative z-10"
              >
                <Settings className={`w-4 h-4 ${isSettingsOpen ? 'animate-spin-slow' : ''}`} />
              </button>

              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-xs uppercase tracking-tighter">Darian</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-xs opacity-80 uppercase tracking-widest font-bold">Controller Activo</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCloseChat}
                className="w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors active:scale-95 relative z-10"
                title="Cerrar chat (ESC)"
                type="button"
                aria-label="Cerrar chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages or Settings */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20 relative">
              <AnimatePresence mode="wait">
                {isSettingsOpen ? (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="h-full flex flex-col space-y-6 pt-4"
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Proveedor de IA</label>
                        <div className="grid grid-cols-3 gap-2">
                          {['gemini', 'gpt', 'deepseek'].map((p) => (
                            <button
                              key={p}
                              onClick={() => setTempProvider(p)}
                              className={`h-11 px-3 rounded-xl border-2 text-xs font-black uppercase tracking-tight transition-all ${
                                tempProvider === p
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-border bg-background text-muted-foreground'
                              }`}
                              type="button"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">API KEY Personal</label>
                        <div className="relative">
                          <input
                            type="password"
                            value={tempApiKey}
                            onChange={(e) => setTempApiKey(e.target.value)}
                            onCopy={(e) => e.preventDefault()}
                            onCut={(e) => e.preventDefault()}
                            placeholder={user?.aiApiKey ? '••••••••••••••••' : 'Pega tu clave aquí...'}
                            className="w-full h-12 bg-background border border-border rounded-xl px-4 text-xs focus:ring-2 focus:ring-primary/20 outline-none pr-10"
                          />
                          <Key className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-50" />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-auto">
                      <button
                        onClick={handleSaveSettings}
                        disabled={isSaving}
                        className="w-full h-14 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                        type="button"
                      >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        {isSaving ? 'Guardando...' : 'Actualizar Configuración'}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="chat"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    {messages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 py-20">
                        <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center border-2 border-dashed border-primary/20">
                          <Sparkles className="w-8 h-8 text-primary opacity-30" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-black uppercase text-primary tracking-widest">Hola, {user?.fullName?.split(' ')[0]}</p>
                          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                            Soy Darian, tu Controller AI. Mantendré los últimos 10 mensajes de nuestra conversación de forma local.
                          </p>
                        </div>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex flex-col w-full ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl text-xs font-medium shadow-sm break-words ${
                          msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-background border border-border rounded-tl-none'
                        }`}>
                          {msg.role === 'assistant' ? (
                            <div className="prose prose-xs dark:prose-invert max-w-none">
                              <ReactMarkdown>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        {msg.metadata && msg.role === 'assistant' && (
                          <div className="mt-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground font-bold uppercase tracking-tighter opacity-60">
                            <span>Key: {msg.metadata.keySource}</span>
                            {msg.metadata.usage && (
                              <>
                                <span>•</span>
                                <span>Tokens: {msg.metadata.usage.total_tokens}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-background border border-border p-3 rounded-2xl rounded-tl-none flex items-center gap-2 shadow-sm">
                          <Loader2 className="w-3 h-3 animate-spin text-primary" />
                          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">La IA está pensando...</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer with last usage info */}
            {!isSettingsOpen && lastMetadata && (
              <div className="px-4 py-1.5 bg-muted/10 border-t border-border/50 flex items-center gap-2">
                <Info className="w-3 h-3 text-primary opacity-50" />
                <span className="text-[10px] font-black uppercase text-muted-foreground/70">
                  {lastMetadata.provider} | {lastMetadata.keySource}
                </span>
              </div>
            )}

            {/* Input */}
            {!isSettingsOpen && (
              <div className="p-4 bg-background border-t border-border">
                <div className={`flex gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border`}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Navega, crea, busca..."
                    className="flex-1 bg-transparent border-none px-3 py-1.5 text-xs font-medium focus:outline-none placeholder:text-muted-foreground/50 h-11"
                  />
                  <button
                    disabled={!input.trim() || isLoading}
                    onClick={handleSend}
                    className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-95 shrink-0"
                    type="button"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[8px] text-center text-muted-foreground/40 mt-2 uppercase tracking-widest font-black">Desarrollado con la API de Gemini 2.5 Flash</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
