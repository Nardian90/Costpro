'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Bot, Loader2, Sparkles, Settings, Key, Check } from 'lucide-react';
import { useAuthStore, useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { userService } from '@/services/user-service';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any[];
}

export function ChatBot() {
  const router = useRouter();
  const { isChatBotOpen: isOpen, setIsChatBotOpen: setIsOpen, currentView } = useUIStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Settings state
  const { user, token, updateUser } = useAuthStore();
  const [tempProvider, setTempProvider] = useState(user?.aiProvider || 'gemini');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ✅ ESC KEY HANDLER - NUEVO
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, setIsOpen]);

  const handleAction = (action: any) => {
    console.log('[AI Controller] Action received:', action);

    switch (action.type) {
      case 'navigation':
        toast.info(`Navegando a ${action.payload.viewId}...`);
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

    const userMessage: Message = { role: 'user', content: input };
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
      setMessages([...newMessages, { role: 'assistant', content: data.text }]);

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
      } else if (errorMsg.includes('Límite de IA alcanzado') || errorMsg.includes('Balance') || errorMsg.includes('Quota')) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠️ ' + errorMsg + ' Puedes cambiar a otro proveedor o ingresar tu propia clave en los ajustes (icono de engranaje arriba).'
        }]);
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await userService.updateAISettings(user.id, tempProvider, tempApiKey);
      updateUser({
        ...user,
        aiProvider: tempProvider as any,
        aiApiKey: tempApiKey || user.aiApiKey
      });
      toast.success('Configuración de IA actualizada');
      setIsSettingsOpen(false);
      setTempApiKey('');
    } catch (error) {
      toast.error('Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ HANDLER CLOSE MEJORADO
  const handleCloseChat = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (abortController) {
      abortController.abort();
    }
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setIsOpen(false);
  }, [abortController, setIsOpen]);

  const isConfigured = !!user?.aiProvider && (!!user?.aiApiKey || user.aiProvider === 'qwen');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            onClick={() => setIsOpen(true)}
            className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-2xl flex items-center justify-center hover:scale-110 transition-transform group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <MessageSquare className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 border-2 border-background rounded-full animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[calc(100vw-2rem)] sm:w-[380px] h-[calc(100vh-4rem)] sm:h-[600px] max-h-[600px] bg-background border border-border shadow-2xl rounded-[32px] flex flex-col overflow-hidden relative"
          >
            {/* Header */}
            <div className="h-20 bg-primary text-primary-foreground flex items-center justify-between px-6 relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />

              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors active:scale-95"
                title="Configuración de IA"
                type="button"
              >
                <Settings className={`w-4 h-4 ${isSettingsOpen ? 'animate-spin-slow' : ''}`} />
              </button>

              <div className="flex items-center gap-3">
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

              {/* ✅ CLOSE BUTTON FIXED */}
              <button
                onClick={handleCloseChat}
                className="w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors active:scale-95 relative z-50"
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
                          {['gemini', 'gpt', 'qwen'].map((p) => (
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
                        <p className="text-xs text-muted-foreground/60 leading-tight">
                          Tu clave se guarda de forma segura. Por seguridad, no se puede visualizar ni copiar una vez guardada.
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 mt-auto">
                      <button
                        onClick={handleSaveSettings}
                        disabled={isSaving || (tempProvider === user?.aiProvider && !tempApiKey)}
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
                          {!isConfigured ? (
                            <div className="p-4 rounded-2xl bg-warning/5 border border-warning/20 space-y-3 mt-4">
                               <p className="text-xs text-warning font-bold uppercase tracking-tight">Darian no configurado</p>
                               <p className="text-xs text-muted-foreground font-medium">
                                 Para interactuar conmigo, primero debes ingresar tu API Key en la configuración.
                               </p>
                               <button
                                 onClick={() => setIsSettingsOpen(true)}
                                 className="w-full h-11 bg-warning/10 text-warning rounded-lg text-xs font-black uppercase"
                                 type="button"
                               >
                                 Configurar Darian
                               </button>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                              Soy Darian, tu Controller AI. Puedo navegar, completar formularios y explicarte el sistema.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl text-xs font-medium shadow-sm break-words ${
                          msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-background border border-border rounded-tl-none'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-background border border-border p-3 rounded-2xl rounded-tl-none flex items-center gap-2 shadow-sm">
                          <Loader2 className="w-3 h-3 animate-spin text-primary" />
                          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Ejecutando...</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input */}
            {!isSettingsOpen && (
              <div className="p-4 bg-background border-t border-border">
                <div className={`flex gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border ${!isConfigured ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    disabled={!isConfigured}
                    placeholder={isConfigured ? "Navega, crea, busca..." : "Configura tu IA para comenzar"}
                    className="flex-1 bg-transparent border-none px-3 py-1.5 text-xs font-medium focus:outline-none placeholder:text-muted-foreground/50 h-11"
                  />
                  <button
                    disabled={!input.trim() || isLoading || !isConfigured}
                    onClick={handleSend}
                    className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-95 shrink-0"
                    type="button"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
