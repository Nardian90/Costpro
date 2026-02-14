'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Bot, Loader2, Sparkles, Settings, Key, Check } from 'lucide-react';
import { useAuthStore, useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { userService } from '@/services/user-service';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function ChatBot() {
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
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
          messages: newMessages,
          storeId: user.activeStoreId,
          aiProvider: user.aiProvider,
          aiApiKey: user.aiApiKey
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al conectar con Eli');
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

  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await userService.updateAISettings(user.id, tempProvider, tempApiKey);

      const updatedData: any = { aiProvider: tempProvider };
      if (tempApiKey) {
        updatedData.aiApiKey = tempApiKey;
      }

      updateUser(updatedData);
      toast.success('Configuración de IA guardada');
      setIsSettingsOpen(false);
      setTempApiKey(''); // Clear sensitive key from state
    } catch (error: any) {
      toast.error('Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const isConfigured = !!(user?.aiApiKey && user?.aiApiKey.length > 5);

  return (
    <div className={cn("fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[100] flex flex-col items-end", currentView === "cost-sheets" && !isOpen && "hidden lg:flex")}>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            aria-label="Abrir chat con Eli"
            className="w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-all border-4 border-background relative overflow-hidden group"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-primary via-primary/80 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <MessageSquare className="w-6 h-6 relative z-10" />
            <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-amber-300 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100" />
          </motion.button>
        )}

        {isOpen && (
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.95 }}
            className="w-[calc(100vw-2rem)] sm:w-[400px] h-[500px] max-h-[calc(100dvh-6rem)] bg-background border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-primary text-primary-foreground flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="hover:bg-white/10 p-2 rounded-xl transition-colors"
                  title="Configuración de IA"
                >
                  <Settings className={`w-4 h-4 ${isSettingsOpen ? 'animate-spin-slow' : ''}`} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-xs uppercase tracking-tighter">Eli</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-xs opacity-80 uppercase tracking-widest font-bold">Inteligencia Integrada</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/10 p-2 rounded-xl transition-colors"
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
                              className={`py-2 px-3 rounded-xl border-2 text-xs font-black uppercase tracking-tight transition-all ${
                                tempProvider === p
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-border bg-background text-muted-foreground'
                              }`}
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
                            className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none pr-10"
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
                        className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
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
                               <p className="text-xs text-warning font-bold uppercase tracking-tight">Eli no configurada</p>
                               <p className="text-xs text-muted-foreground font-medium">
                                 Para interactuar conmigo, primero debes ingresar tu API Key en la configuración.
                               </p>
                               <button
                                 onClick={() => setIsSettingsOpen(true)}
                                 className="w-full py-2 bg-warning/10 text-warning rounded-lg text-xs font-black uppercase"
                               >
                                 Configurar Eli
                               </button>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                              Soy Eli. Mi propósito es asistirte con precisión técnica sobre inventarios, ventas y normativas vigentes del sistema.
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
                          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Analizando...</span>
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
                    placeholder={isConfigured ? "Consultar stock, ventas, sugerencias..." : "Configura tu IA para comenzar"}
                    className="flex-1 bg-transparent border-none px-3 py-1.5 text-xs font-medium focus:outline-none placeholder:text-muted-foreground/50"
                  />
                  <button
                    disabled={!input.trim() || isLoading || !isConfigured}
                    onClick={handleSend}
                    className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-95"
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
