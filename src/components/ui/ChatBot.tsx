'use client';
import { logger } from '@/lib/logger';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Bot, Loader2, Sparkles, Settings, Key, Check, Trash2, Lightbulb, RefreshCw, ChevronDown, AlertTriangle, ImagePlus, Plus, Clock, MessageCircle, Copy, Download, Maximize2, Minimize2, PanelLeft } from 'lucide-react';
import { useAuthStore, useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { userService } from '@/services/user-service';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'model';
  content: string;
  tool_calls?: any[];
  imageData?: { mimeType: string; data: string } | null;
  isError?: boolean;
  timestamp?: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  hasImage?: boolean;
}

interface ModelOption {
  id: string;
  label: string;
  badge?: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'glm-4-flash', label: 'GLM-4 Flash (z.ai)', badge: 'Default' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'Rápido' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Preciso' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', badge: 'Estable' },
];

const QUICK_PROMPTS = [
  { icon: '📊', text: 'Muéstrame el resumen de costos', view: 'cost-sheets' },
  { icon: '📦', text: '¿Cómo creo una ficha de costo?', view: 'cost-sheets' },
  { icon: '🔍', text: 'Busca un producto en el catálogo', view: 'catalog' },
  { icon: '📈', text: '¿Qué ventas se hicieron hoy?', view: 'sales' },
];

// ─── STORAGE HELPERS WITH DEBOUNCE ────────────────────────────────────────────
const CONVERSATIONS_KEY = 'darian_chat_conversations';
const ACTIVE_CONVO_KEY = 'darian_chat_active_conversation';
const MODEL_STORAGE_KEY = 'darian_chat_model';
const SETTINGS_STORAGE_KEY = 'darian_chat_settings';
const TEMP_STORAGE_KEY = 'darian_chat_temperature';

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

// Debounced save to avoid blocking main thread
let saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
function debouncedSave(key: string, value: any, delay = 300) {
  if (typeof window === 'undefined') return;
  if (saveTimers[key]) clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage full */ }
  }, delay);
}

// ─── CONVERSATION MANAGEMENT ──────────────────────────────────────────────────
function createConversation(title?: string, firstMessage?: string): Conversation {
  return {
    id: crypto.randomUUID(),
    title: title || firstMessage?.slice(0, 40) || 'Nueva conversación',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── CHATBOT COMPONENT ───────────────────────────────────────────────────────
export function ChatBot({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const { isChatBotOpen: isOpen, setIsChatBotOpen: setIsOpen, currentView } = useUIStore();
  // FEATURE-CHATBOT-VIEW: When embedded=true, the chat is rendered as a
  // first-class view (ChatBotView) instead of a floating window. This ignores
  // the isOpen state from the store and always renders the chat panel,
  // filling its parent container.
  const effectivelyOpen = embedded ? true : isOpen;

  // Multi-conversation state (F1-04)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  // Ref to track active conversation ID synchronously (avoids stale state in async handlers)
  const activeConvoIdRef = useRef<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isModelOpen, setIsModelOpen] = useState(false);
  // FEATURE: maximize chat as a full view for better concentration
  const [isMaximized, setIsMaximized] = useState(false);

  // Attached image state (F1-01)
  const [attachedImage, setAttachedImage] = useState<{ mimeType: string; data: string; preview: string } | null>(null);

  // Settings state
  const { user, token, updateUser } = useAuthStore();
  const [tempProvider, setTempProvider] = useState(user?.aiProvider || 'glm');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  // Temperature control (F2-02)
  const [temperature, setTemperature] = useState<number>(() => loadFromStorage(TEMP_STORAGE_KEY, 0.4));

  // Latency tracking (UX improvement)
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const requestStartTimeRef = useRef<number>(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Persisted selected model
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    loadFromStorage(MODEL_STORAGE_KEY, 'glm-4-flash')
  );

  // ─── DERIVED STATE ────────────────────────────────────────────────────────
  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;
  const messages = activeConversation?.messages || [];

  // ─── LOAD CONVERSATIONS ON MOUNT ──────────────────────────────────────────
  useEffect(() => {
    const saved = loadFromStorage<Conversation[]>(CONVERSATIONS_KEY, []);
    const savedActiveId = loadFromStorage<string | null>(ACTIVE_CONVO_KEY, null);

    if (saved.length > 0) {
      setConversations(saved);
      const restoredId = (savedActiveId && saved.find(c => c.id === savedActiveId))
        ? savedActiveId
        : saved[0].id;
      setActiveConversationId(restoredId);
      activeConvoIdRef.current = restoredId;
    } else {
      // Migrate legacy single-conversation messages
      try {
        const legacyMessages = localStorage.getItem('darian_chat_messages');
        if (legacyMessages) {
          const parsed = JSON.parse(legacyMessages);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const newConvo = createConversation('Conversación anterior', parsed[0]?.content);
            newConvo.messages = parsed;
            setConversations([newConvo]);
            setActiveConversationId(newConvo.id);
            activeConvoIdRef.current = newConvo.id;
            localStorage.removeItem('darian_chat_messages');
            debouncedSave(CONVERSATIONS_KEY, [newConvo]);
          }
        }
      } catch { /* ignore */ }
    }
  }, []);

  // ─── PERSIST CONVERSATIONS WITH DEBOUNCE ─────────────────────────────────
  useEffect(() => {
    if (conversations.length > 0) {
      debouncedSave(CONVERSATIONS_KEY, conversations);
    }
    if (activeConversationId) {
      debouncedSave(ACTIVE_CONVO_KEY, activeConversationId);
    }
  }, [conversations, activeConversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isSettingsOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isSettingsOpen]);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!isModelOpen) return;
    const handler = () => setIsModelOpen(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [isModelOpen]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (isSidebarOpen) {
          setIsSidebarOpen(false);
        } else {
          handleCloseChat();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isSettingsOpen, isSidebarOpen]);

  // ─── TEXTAREA AUTO-RESIZE (F1-03) ────────────────────────────────────────
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // ─── CONVERSATION ACTIONS ────────────────────────────────────────────────
  const createNewConversation = useCallback(() => {
    const newConvo = createConversation();
    setConversations(prev => [newConvo, ...prev]);
    setActiveConversationId(newConvo.id);
    activeConvoIdRef.current = newConvo.id;
    setAttachedImage(null);
    setIsSidebarOpen(false);
    inputRef.current?.focus();
  }, []);

  const switchConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    activeConvoIdRef.current = id;
    setAttachedImage(null);
    setIsSidebarOpen(false);
    inputRef.current?.focus();
  }, []);

  const deleteConversation = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      if (updated.length === 0) {
        const newConvo = createConversation();
        setActiveConversationId(newConvo.id);
        activeConvoIdRef.current = newConvo.id;
        return [newConvo];
      }
      if (activeConvoIdRef.current === id) {
        setActiveConversationId(updated[0].id);
        activeConvoIdRef.current = updated[0].id;
      }
      return updated;
    });
    toast.success('Conversación eliminada');
  }, [activeConversationId]);

  const renameConversation = useCallback((id: string, newTitle: string) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c)
    );
  }, []);

  const handleClearChat = useCallback(() => {
    if (!activeConversationId) return;
    setConversations(prev =>
      prev.map(c => c.id === activeConversationId ? { ...c, messages: [], updatedAt: Date.now() } : c)
    );
    toast.success('Conversación eliminada');
  }, [activeConversationId]);

  // ─── FEATURE: Copy conversation to clipboard ────────────────────────────
  const handleCopyConversation = useCallback(() => {
    const convo = conversations.find(c => c.id === activeConversationId);
    if (!convo || convo.messages.length === 0) {
      toast.warning('La conversación está vacía');
      return;
    }
    const text = convo.messages
      .map(m => {
        const role = m.role === 'user' ? '🧑 Usuario' : m.role === 'assistant' ? '🤖 Darian' : m.role;
        const time = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
        return `### ${role} — ${time}\n\n${m.content}`;
      })
      .join('\n\n---\n\n');
    const header = `# Conversación con Darian\n**Título:** ${convo.title}\n**Fecha de exportación:** ${new Date().toLocaleString()}\n**Mensajes:** ${convo.messages.length}\n\n---\n\n`;
    navigator.clipboard.writeText(header + text)
      .then(() => toast.success(`Conversación copiada (${convo.messages.length} mensajes)`))
      .catch(() => toast.error('No se pudo copiar al portapapeles'));
  }, [conversations, activeConversationId]);

  // ─── FEATURE: Export conversation as Markdown file ──────────────────────
  const handleExportConversation = useCallback(() => {
    const convo = conversations.find(c => c.id === activeConversationId);
    if (!convo || convo.messages.length === 0) {
      toast.warning('La conversación está vacía');
      return;
    }
    const text = convo.messages
      .map(m => {
        const role = m.role === 'user' ? '🧑 Usuario' : m.role === 'assistant' ? '🤖 Darian' : m.role;
        const time = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
        return `### ${role} — ${time}\n\n${m.content}`;
      })
      .join('\n\n---\n\n');
    const header = `# Conversación con Darian\n\n**Título:** ${convo.title}\n**Fecha de exportación:** ${new Date().toLocaleString()}\n**Mensajes:** ${convo.messages.length}\n\n---\n\n`;
    const fullText = header + text;
    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = convo.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'conversacion';
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `chat-darian-${safeTitle}-${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Conversación exportada como Markdown`);
  }, [conversations, activeConversationId]);

  // ─── FEATURE: Toggle maximize/restore chat view ─────────────────────────
  const handleToggleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
  }, []);

  // ─── IMAGE HANDLING (F1-01) ─────────────────────────────────────────────
  const handleImageAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size (max 10MB)
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('La imagen no debe superar 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Full = reader.result as string;
      const base64Data = base64Full.split(',')[1];
      const mimeType = file.type;

      setAttachedImage({
        mimeType,
        data: base64Data,
        preview: base64Full,
      });
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be re-selected
    e.target.value = '';
  }, []);

  const removeAttachedImage = useCallback(() => {
    setAttachedImage(null);
  }, []);

  // ─── ACTIONS HANDLER ─────────────────────────────────────────────────────
  const handleAction = (action: any) => {
    logger.info('DATABASE', '[AI_CONTROLLER]_ACTION_RECEIVED:', { data: action })

    switch (action.type) {
      case 'navigation':
        toast.info(`Navegando a ${action.payload.viewId}...`);
        router.push(action.payload.route);
        break;

      case 'form_fill':
        toast.success(`Formulario ${action.payload.formName} completado por Darian`);
        window.dispatchEvent(new CustomEvent('ai:fill-form', { detail: action.payload }));
        break;

      case 'form_submit':
        toast.success(`Formulario ${action.payload.formName} enviado por Darian`);
        window.dispatchEvent(new CustomEvent('ai:submit-form', { detail: action.payload }));
        break;

      case 'export':
        toast.success(`Archivo ${action.payload.type.toUpperCase()} listo para descargar`);
        break;

      case 'ui_mode':
        toast.info(`Cambiando a modo ${action.payload.mode}`);
        break;

      default:
        logger.warn('DATABASE', 'ACCIÓN_AI_DESCONOCIDA:', { data: action.type })
    }
  };

  const addErrorMessage = (content: string, targetConvoId?: string) => {
    const errorMsg: Message = {
      role: 'assistant',
      content,
      id: crypto.randomUUID(),
      isError: true,
      timestamp: Date.now()
    };

    const convoTarget = targetConvoId || activeConvoIdRef.current;
    if (convoTarget) {
      setConversations(prev =>
        prev.map(c => c.id === convoTarget ? { ...c, messages: [...c.messages, errorMsg], updatedAt: Date.now() } : c)
      );
    }
  };

  // ─── SEND MESSAGE (with streaming) ───────────────────────────────────────
  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() && !attachedImage) return;
    if (isLoading) return;

    // Ensure we have an active conversation
    let convoId = activeConvoIdRef.current || activeConversationId;
    if (!convoId) {
      const newConvo = createConversation(undefined, textToSend);
      setConversations(prev => [newConvo, ...prev]);
      setActiveConversationId(newConvo.id);
      activeConvoIdRef.current = newConvo.id;
      convoId = newConvo.id;
    } else {
      activeConvoIdRef.current = convoId;
    }

    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      imageData: attachedImage ? { mimeType: attachedImage.mimeType, data: attachedImage.data } : null,
    };

    // Update conversation with user message and auto-title
    setConversations(prev => {
      return prev.map(c => {
        if (c.id !== convoId) return c;
        const updatedMessages = [...c.messages, userMessage];
        const title = c.messages.length === 0 && textToSend.trim()
          ? textToSend.slice(0, 40) + (textToSend.length > 40 ? '...' : '')
          : c.title;
        return {
          ...c,
          messages: updatedMessages,
          title,
          updatedAt: Date.now(),
          hasImage: c.hasImage || !!attachedImage,
        };
      });
    });

    setInput('');
    setAttachedImage(null);
    setIsLoading(true);
    setLatencyMs(null);
    requestStartTimeRef.current = Date.now();

    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Build messages for API call.
      // Note: conversations state from closure may be stale (pre-userMessage),
      // but userMessage is always appended below. This is safe because
      // isLoading prevents concurrent requests.
      const currentConvo = conversations.find(c => c.id === convoId);
      const allMessages = [...(currentConvo?.messages || []), userMessage];
      const apiMessages = allMessages
        .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
        .slice(-30); // Context window

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Use streaming (F2-01)
      const response = await fetch('/api/bot/chat', {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          messages: apiMessages,
          storeId: user?.activeStoreId || undefined,
          // Default: usar el provider del usuario, o 'glm' (z.ai) que tiene key default en el server
          aiProvider: user?.aiProvider || 'glm',
          // Si el usuario tiene su propia key, la enviamos. Si no, el server usa la default.
          aiApiKey: user?.aiApiKey || undefined,
          model: selectedModel,
          temperature,
          stream: true,
          context: {
            currentView,
            uiMode: 'standard'
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}: No se pudo conectar con Darian`);
      }

      // Handle SSE streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No se pudo obtener el stream de respuesta');

      const decoder = new TextDecoder();
      let fullText = '';
      let assistantMsgId = crypto.randomUUID();
      let actions: any[] = [];

      // Create a placeholder assistant message
      setConversations(prev =>
        prev.map(c => c.id === convoId
          ? { ...c, messages: [...c.messages, { role: 'assistant', content: '', id: assistantMsgId, timestamp: Date.now() }], updatedAt: Date.now() }
          : c
        )
      );

      // Read stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              addErrorMessage(parsed.error);
              fullText = '';
              break;
            }
            if (parsed.text) {
              fullText += parsed.text;
              // Update the assistant message with accumulated text
              const currentText = fullText;
              setConversations(prev =>
                prev.map(c => c.id === convoId
                  ? { ...c, messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, content: currentText } : m), updatedAt: Date.now() }
                  : c
                )
              );
            }
            if (parsed.metadata?.actions) {
              actions = parsed.metadata.actions;
            }
            if (parsed.done) {
              // Finalize
              setLatencyMs(Date.now() - requestStartTimeRef.current);
            }
          } catch {
            // Ignore parse errors for partial chunks
          }
        }
      }

      // If no text was received via streaming, fall back to non-streaming
      if (!fullText) {
        // Remove the empty placeholder
        setConversations(prev =>
          prev.map(c => c.id === convoId
            ? { ...c, messages: c.messages.filter(m => m.id !== assistantMsgId), updatedAt: Date.now() }
            : c
          )
        );
        throw new Error('No se recibió respuesta del servidor');
      }

      // Execute client-side actions
      actions.forEach(handleAction);

      setLatencyMs(Date.now() - requestStartTimeRef.current);

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('DATABASE', '[CHAT]_REQUEST_CANCELLED_BY_USER');
        addErrorMessage('Solicitud cancelada.', convoId);
        return;
      }

      const errorMsg = error instanceof Error ? (error.message || '') : String(error);

      if (errorMsg.includes('Cuota') || errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        addErrorMessage('**Cuota agotada.** Espera un momento o cambia tu API Key en los ajustes.', convoId);
      } else if (errorMsg.includes('inválida') || errorMsg.includes('401') || errorMsg.includes('PERMISSION_DENIED')) {
        addErrorMessage('**API Key inválida o expirada.** Verifica tu clave en los ajustes.', convoId);
      } else if (errorMsg.includes('Timeout')) {
        addErrorMessage('**Tiempo de espera agotado.** La respuesta tardó demasiado. Intenta de nuevo.', convoId);
      } else {
        addErrorMessage(errorMsg, convoId);
      }
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  };

  // ─── SETTINGS ────────────────────────────────────────────────────────────
  const handleTestApiKey = async () => {
    const keyToTest = tempApiKey || user?.aiApiKey;
    if (!keyToTest) {
      toast.error('No hay API Key para probar');
      return;
    }
    setIsTesting(true);
    setTestResult('idle');
    try {
      const res = await fetch('/api/bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'ping', id: 'test' }],
          aiApiKey: keyToTest,
          aiProvider: tempProvider || 'glm',
        }),
      });
      setTestResult(res.ok ? 'success' : 'error');
      toast.success(res.ok ? 'API Key válida — conexión exitosa' : 'API Key inválida');
    } catch {
      setTestResult('error');
      toast.error('Error de conexión');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) {
      saveToStorage(SETTINGS_STORAGE_KEY, { provider: tempProvider, apiKey: tempApiKey });
      toast.success('Configuración guardada localmente');
      setIsSettingsOpen(false);
      return;
    }
    setIsSaving(true);
    try {
      await userService.updateAISettings(user.id, user.id, tempProvider, tempApiKey);
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

  const handleCloseChat = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (abortController) {
      abortController.abort();
    }
    setIsSettingsOpen(false);
    setIsModelOpen(false);
    setIsSidebarOpen(false);
    setInput('');
    setIsLoading(false);
    setAttachedImage(null);
    setIsOpen(false);
  }, [abortController, setIsOpen]);

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    debouncedSave(MODEL_STORAGE_KEY, modelId);
    setIsModelOpen(false);
    const model = MODEL_OPTIONS.find(m => m.id === modelId);
    toast.success(`Modelo: ${model?.label || modelId}`);
  };

  const currentModelLabel = MODEL_OPTIONS.find(m => m.id === selectedModel)?.label || selectedModel;

  function saveToStorage(key: string, value: any) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage full */ }
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────
  // FEATURE-CHATBOT-VIEW: When embedded, render without the floating FAB
  // and without fixed positioning — the parent ChatBotView handles layout.
  return (
    <div className={cn(
      embedded ? "w-full h-full flex flex-col" : "fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-3"
    )}>
      <AnimatePresence>
        {!effectivelyOpen && !embedded && (
          <motion.button
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            onClick={() => setIsOpen(true)}
            aria-label="Abrir chat con Darian"
            aria-expanded={isOpen}
            className="w-14 h-14 rounded-full bg-primary/15 backdrop-blur-xl border-2 border-primary/30 text-primary shadow-lg shadow-primary/15 flex items-center justify-center hover:scale-110 hover:bg-primary/25 transition-all duration-300 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
            <MessageSquare className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {effectivelyOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            role="dialog"
            aria-label="Chat con Darian"
            aria-modal="true"
            className={cn(
              "bg-background border border-border shadow-2xl rounded-2xl sm:rounded-[28px] flex flex-col overflow-hidden transition-all duration-300",
              embedded
                ? "w-full h-full rounded-none border-0 shadow-none"
                : "fixed top-3 right-3 bottom-3 left-3 sm:left-auto sm:w-[460px] z-50",
              !embedded && isMaximized && "!left-3 !right-3 !top-3 !bottom-3 sm:!w-auto sm:!max-w-[1400px] sm:!mx-auto"
            )}
          >
            {/* ─── HEADER ─── */}
            {/* FEATURE-CHATBOT-VIEW: When embedded, render a minimal toolbar
                instead of the green Darian header (the ChatBotView already
                provides a premium header with avatar, 3D building, role badge). */}
            {embedded ? (
              <div className="h-11 bg-muted/30 border-b border-border/50 flex items-center justify-between px-2 shrink-0">
                {/* Left: conversations toggle */}
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  aria-label="Lista de conversaciones"
                  className="w-9 h-9 flex items-center justify-center hover:bg-muted rounded-lg transition-colors active:scale-95 text-muted-foreground"
                  title="Conversaciones"
                  type="button"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>

                {/* Center: settings (model selector) */}
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg hover:bg-muted transition-colors text-xs font-medium text-muted-foreground"
                  type="button"
                  aria-label="Configuración de IA"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Configuración</span>
                </button>

                {/* Right: action buttons (no close/maximize — those are floating-only) */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={handleCopyConversation}
                    className="w-9 h-9 flex items-center justify-center hover:bg-muted rounded-lg transition-colors active:scale-95 text-muted-foreground"
                    title="Copiar conversación"
                    type="button"
                    aria-label="Copiar conversación"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleExportConversation}
                    className="w-9 h-9 flex items-center justify-center hover:bg-muted rounded-lg transition-colors active:scale-95 text-muted-foreground"
                    title="Exportar como Markdown"
                    type="button"
                    aria-label="Exportar conversación"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
            <div className="h-14 bg-primary text-primary-foreground flex items-center justify-between px-3 relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />

              {/* Sidebar toggle (conversations list) */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                aria-label="Lista de conversaciones"
                className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors active:scale-95 relative z-10"
                title="Conversaciones"
                type="button"
              >
                <MessageCircle className={cn('w-4 h-4')} />
              </button>

              {/* Darian info */}
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="flex items-center gap-2 relative z-10"
                type="button"
                aria-label="Configuración de IA"
              >
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="text-center">
                  <h3 className="font-black text-[11px] uppercase tracking-tighter leading-none">Darian</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[9px] opacity-80 uppercase tracking-widest font-bold">Controller Activo</p>
                  </div>
                </div>
              </button>

              {/* Action buttons: copy, export, maximize, close */}
              <div className="flex items-center gap-0.5 relative z-50">
                <button
                  onClick={handleCopyConversation}
                  className="w-9 h-9 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors active:scale-95"
                  title="Copiar conversación"
                  type="button"
                  aria-label="Copiar conversación"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={handleExportConversation}
                  className="w-9 h-9 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors active:scale-95"
                  title="Exportar como Markdown"
                  type="button"
                  aria-label="Exportar conversación"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={handleToggleMaximize}
                  className="w-9 h-9 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors active:scale-95"
                  title={isMaximized ? "Restaurar vista" : "Maximizar vista"}
                  type="button"
                  aria-label={isMaximized ? "Restaurar vista" : "Maximizar vista"}
                >
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleCloseChat}
                  className="w-9 h-9 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors active:scale-95"
                  title="Cerrar chat (ESC)"
                  type="button"
                  aria-label="Cerrar chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            )}

            {/* ─── CONVERSATIONS SIDEBAR (F1-04) ─── */}
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0, x: -200 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -200 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="absolute inset-0 z-30 bg-background flex flex-col"
                >
                  <div className="h-14 bg-primary/10 flex items-center justify-between px-4 shrink-0">
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Conversaciones</span>
                    <button
                      onClick={createNewConversation}
                      className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity active:scale-95"
                      title="Nueva conversación"
                      type="button"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {conversations.map((convo) => (
                      <div
                        key={convo.id}
                        onClick={() => switchConversation(convo.id)}
                        className={cn(
                          'group flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all text-left',
                          convo.id === activeConversationId
                            ? 'bg-primary/10 border border-primary/20'
                            : 'hover:bg-muted border border-transparent'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {convo.hasImage && <ImagePlus className="w-3 h-3 text-primary/50 shrink-0" />}
                            <p className="text-xs font-semibold truncate">{convo.title}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {convo.messages.length} mensajes
                          </p>
                        </div>
                        <button
                          onClick={(e) => deleteConversation(convo.id, e)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                          title="Eliminar conversación"
                          type="button"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {conversations.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground/50">
                        <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No hay conversaciones</p>
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t border-border">
                    <button
                      onClick={() => setIsSidebarOpen(false)}
                      className="w-full h-10 rounded-xl border border-border text-xs font-bold uppercase tracking-widest hover:bg-muted transition-colors"
                      type="button"
                    >
                      Volver al chat
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── CONTENT AREA ─── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20 relative min-h-0" aria-live="polite" aria-atomic="false">
              <AnimatePresence mode="wait">
                {isSettingsOpen ? (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="h-full flex flex-col space-y-4 pt-2 overflow-y-auto"
                  >
                    {/* Model selector */}
                    <div className="space-y-2">
                      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Modelo</span>
                      <div className="grid grid-cols-1 gap-1.5">
                        {MODEL_OPTIONS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => handleModelSelect(m.id)}
                            className={cn(
                              'h-10 px-3 rounded-xl border-2 text-xs font-bold uppercase tracking-tight transition-all flex items-center justify-between',
                              selectedModel === m.id
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/20'
                            )}
                            type="button"
                          >
                            <span>{m.label}</span>
                            {m.badge && (
                              <span className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded-md font-bold',
                                selectedModel === m.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground/70'
                              )}>
                                {m.badge}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Temperature slider (F2-02) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Temperatura</span>
                        <span className="text-xs font-bold text-primary">{temperature.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTemperature(val);
                          debouncedSave(TEMP_STORAGE_KEY, val);
                        }}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between text-[9px] text-muted-foreground/60 uppercase tracking-widest">
                        <span>Preciso</span>
                        <span>Creativo</span>
                      </div>
                    </div>

                    {/* API Provider */}
                    <div className="space-y-2">
                      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Proveedor</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['glm', 'gemini', 'gpt', 'qwen'].map((p) => (
                          <button
                            key={p}
                            onClick={() => setTempProvider(p)}
                            className={cn(
                              'h-10 px-3 rounded-xl border-2 text-xs font-black uppercase tracking-tight transition-all',
                              tempProvider === p
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-border bg-background text-muted-foreground'
                            )}
                            type="button"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* API Key */}
                    <div className="space-y-2">
                      <label htmlFor="chatbot-api-key" className="text-xs font-black uppercase tracking-widest text-muted-foreground">API KEY</label>
                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <input
                            id="chatbot-api-key"
                            type="password"
                            aria-label="API KEY Personal"
                            value={tempApiKey}
                            onChange={(e) => setTempApiKey(e.target.value)}
                            onCopy={(e) => e.preventDefault()}
                            onCut={(e) => e.preventDefault()}
                            placeholder={user?.aiApiKey ? '••••••••••••••••' : 'Pega tu clave aquí...'}
                            className="w-full h-11 bg-background border border-border rounded-xl px-3 text-xs focus:ring-2 focus:ring-primary/20 outline-none pr-9"
                          />
                          <Key className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground opacity-40" />
                        </div>
                        <button
                          onClick={handleTestApiKey}
                          disabled={isTesting}
                          className="px-3 h-11 bg-muted hover:bg-muted/80 text-xs font-bold rounded-xl transition disabled:opacity-50 shrink-0 flex items-center gap-1"
                          type="button"
                          title="Probar conexión"
                        >
                          {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          <span className="hidden sm:inline text-[10px]">Probar</span>
                        </button>
                      </div>
                      {testResult !== 'idle' && (
                        <p className={cn('text-[10px] font-semibold', testResult === 'success' ? 'text-emerald-500' : 'text-destructive')}>
                          {testResult === 'success' ? 'Conexión exitosa' : 'Clave inválida o sin conexión'}
                        </p>
                      )}
                    </div>

                    {/* Save button */}
                    <div className="pt-2 mt-auto">
                      <button
                        onClick={handleSaveSettings}
                        disabled={isSaving}
                        className="w-full h-12 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                        type="button"
                      >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        {isSaving ? 'Guardando...' : 'Guardar Configuración'}
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
                    {/* ─── EMPTY STATE — minimalist Z.ai style ─── */}
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center px-4 sm:px-8 py-8 max-w-2xl mx-auto w-full">
                        {/* Hero heading */}
                        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3 sm:mb-4 text-foreground">
                          ¿En qué puedo ayudarte?
                        </h2>
                        <p className="text-xs sm:text-sm text-muted-foreground max-w-md leading-relaxed mb-6 sm:mb-8">
                          Soy Darian, tu asistente de CostPro. Puedo consultar costos, ventas, buscar productos y ejecutar acciones.
                        </p>

                        {/* Embedded input — Z.ai style (centered, no border-t) */}
                        <div className="w-full max-w-2xl mb-4">
                          {/* Top bar: model selector */}
                          <div className="flex items-center justify-between mb-1.5 px-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setIsModelOpen(!isModelOpen); }}
                              className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors uppercase tracking-widest font-bold"
                              type="button"
                            >
                              {currentModelLabel}
                              <ChevronDown className={cn('w-3 h-3 transition-transform', isModelOpen && 'rotate-180')} />
                            </button>
                          </div>

                          {/* Model dropdown */}
                          <AnimatePresence>
                            {isModelOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: 4, scaleY: 0.95 }}
                                animate={{ opacity: 1, y: 0, scaleY: 1 }}
                                exit={{ opacity: 0, y: 4, scaleY: 0.95 }}
                                className="origin-top mb-1.5 p-1.5 bg-popover border border-border rounded-xl shadow-lg space-y-0.5"
                              >
                                {MODEL_OPTIONS.map((m) => (
                                  <button
                                    key={m.id}
                                    onClick={(e) => { e.stopPropagation(); handleModelSelect(m.id); }}
                                    className={cn(
                                      'w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between',
                                      selectedModel === m.id
                                        ? 'bg-primary/10 text-primary'
                                        : 'hover:bg-muted text-muted-foreground'
                                    )}
                                    type="button"
                                  >
                                    <span>{m.label}</span>
                                    {m.badge && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted font-bold">{m.badge}</span>
                                    )}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Attached image preview */}
                          <AnimatePresence>
                            {attachedImage && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mb-1.5 relative inline-block"
                              >
                                <img
                                  src={attachedImage.preview}
                                  alt="Vista previa"
                                  className="max-h-24 max-w-48 rounded-lg border border-border object-contain"
                                />
                                <button
                                  onClick={removeAttachedImage}
                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                                  type="button"
                                  aria-label="Quitar imagen"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Input row */}
                          <div className="flex gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border focus-within:border-primary/30 transition-colors items-end">
                            <button
                              onClick={handleImageAttach}
                              disabled={isLoading}
                              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 shrink-0"
                              type="button"
                              title="Adjuntar imagen"
                              aria-label="Adjuntar imagen"
                            >
                              <ImagePlus className="w-4 h-4" />
                            </button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="hidden"
                              onChange={handleImageChange}
                            />
                            <textarea
                              ref={inputRef}
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSend();
                                }
                              }}
                              disabled={isLoading}
                              aria-label="Escribir mensaje al asistente"
                              placeholder="Pregunta algo a Darian..."
                              rows={1}
                              className="flex-1 bg-transparent border-none px-1 py-1.5 text-xs font-medium focus:outline-none placeholder:text-muted-foreground/50 resize-none disabled:cursor-not-allowed min-h-[40px] max-h-[120px] leading-5"
                            />
                            <button
                              disabled={(!input.trim() && !attachedImage) || isLoading}
                              onClick={() => handleSend()}
                              className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-95 shrink-0"
                              type="button"
                              aria-label="Enviar mensaje"
                            >
                              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-center text-[9px] text-muted-foreground/30 mt-1 uppercase tracking-widest">
                            Darian AI · {currentModelLabel} · T:{temperature.toFixed(1)}
                          </p>
                        </div>

                        {/* Minimal suggestions — below input */}
                        <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                          {QUICK_PROMPTS.map((prompt, i) => (
                            <button
                              key={i}
                              onClick={() => handleSend(prompt.text)}
                              disabled={isLoading}
                              className="px-3 py-1.5 rounded-full border border-border bg-background/50 hover:bg-muted hover:border-primary/30 transition-all text-[11px] sm:text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                              type="button"
                            >
                              {prompt.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                    {/* ─── MESSAGE LIST ─── */}
                    {messages.map((msg, i) => (
                      <div key={msg.id || i} className={cn('flex w-full', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[88%] rounded-2xl text-xs font-medium shadow-sm break-words',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-none px-4 py-2.5'
                            : msg.isError
                              ? 'bg-destructive/5 border border-destructive/20 text-destructive rounded-tl-none px-4 py-3'
                              : 'bg-background border border-border rounded-tl-none px-4 py-3'
                        )}>
                          {msg.role === 'user' && msg.imageData && (
                            <div className="mb-2 -mt-1 -mx-1 rounded-lg overflow-hidden">
                              <img
                                src={`data:${msg.imageData.mimeType};base64,${msg.imageData.data}`}
                                alt="Imagen adjunta"
                                className="max-w-full max-h-48 rounded-lg object-contain"
                              />
                            </div>
                          )}
                          {msg.role === 'assistant' ? (
                            <div className={cn(
                              'prose prose-xs max-w-none',
                              msg.isError ? 'prose-destructive' : 'prose-neutral dark:prose-invert',
                              '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:leading-relaxed [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_strong]:font-bold [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-[11px] [&_pre]:bg-muted [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:my-2 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_a]:text-primary [&_a]:underline'
                            )}>
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          ) : (
                            <span>{msg.content}</span>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* ─── LOADING INDICATOR (streaming-aware) ─── */}
                    {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content === '' && (
                      <div className="flex justify-start">
                        <div className="bg-background border border-border px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2.5 shadow-sm">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Pensando...</span>
                        </div>
                      </div>
                    )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ─── INPUT AREA (only when conversation has started) ─── */}
            {/* FEATURE-ZAI-STYLE: When messages.length === 0, the input is
                rendered inline in the empty state (centered, Z.ai style).
                Once the conversation starts, the input moves to the bottom. */}
            {!isSettingsOpen && !isSidebarOpen && messages.length > 0 && (
              <div className="p-3 bg-background border-t border-border shrink-0">
                {/* Top bar: model selector + clear + latency */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsModelOpen(!isModelOpen); }}
                      className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors uppercase tracking-widest font-bold"
                      type="button"
                    >
                      {currentModelLabel}
                      <ChevronDown className={cn('w-3 h-3 transition-transform', isModelOpen && 'rotate-180')} />
                    </button>

                    {/* Latency indicator */}
                    {latencyMs !== null && !isLoading && (
                      <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground/40">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{(latencyMs / 1000).toFixed(1)}s</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {messages.length > 0 && (
                      <button
                        onClick={handleClearChat}
                        disabled={isLoading}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-destructive transition-colors uppercase tracking-widest font-bold disabled:opacity-50"
                        type="button"
                        title="Limpiar conversación"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="hidden sm:inline">Limpiar</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Model dropdown */}
                <AnimatePresence>
                  {isModelOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scaleY: 0.95 }}
                      animate={{ opacity: 1, y: 0, scaleY: 1 }}
                      exit={{ opacity: 0, y: 4, scaleY: 0.95 }}
                      className="origin-top mb-1.5 p-1.5 bg-popover border border-border rounded-xl shadow-lg space-y-0.5"
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <button
                          key={m.id}
                          onClick={(e) => { e.stopPropagation(); handleModelSelect(m.id); }}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between',
                            selectedModel === m.id
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted text-muted-foreground'
                          )}
                          type="button"
                        >
                          <span>{m.label}</span>
                          {m.badge && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted font-bold">{m.badge}</span>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Attached image preview */}
                <AnimatePresence>
                  {attachedImage && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-1.5 relative inline-block"
                    >
                      <img
                        src={attachedImage.preview}
                        alt="Vista previa"
                        className="max-h-24 max-w-48 rounded-lg border border-border object-contain"
                      />
                      <button
                        onClick={removeAttachedImage}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                        type="button"
                        aria-label="Quitar imagen"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Input row with textarea (F1-03) */}
                <div className="flex gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border focus-within:border-primary/30 transition-colors items-end">
                  {/* Image attach button (F1-01) */}
                  <button
                    onClick={handleImageAttach}
                    disabled={isLoading}
                    className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 shrink-0"
                    type="button"
                    title="Adjuntar imagen"
                    aria-label="Adjuntar imagen"
                  >
                    <ImagePlus className="w-4 h-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleImageChange}
                  />

                  {/* Auto-expandable textarea */}
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter sends, Shift+Enter adds newline (F1-03)
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={isLoading}
                    aria-label="Escribir mensaje al asistente"
                    placeholder="Pregunta algo a Darian..."
                    rows={1}
                    className="flex-1 bg-transparent border-none px-1 py-1.5 text-xs font-medium focus:outline-none placeholder:text-muted-foreground/50 resize-none disabled:cursor-not-allowed min-h-[40px] max-h-[120px] leading-5"
                  />

                  <button
                    disabled={(!input.trim() && !attachedImage) || isLoading}
                    onClick={() => handleSend()}
                    className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-95 shrink-0"
                    type="button"
                    aria-label="Enviar mensaje"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-center text-[9px] text-muted-foreground/30 mt-1 uppercase tracking-widest">
                  Darian AI · {currentModelLabel} · T:{temperature.toFixed(1)}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
