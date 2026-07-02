'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Send, ArrowLeft, Search, Loader2, MessageCircle, Ban,
  Image as ImageIcon, FileText, Mic, Music, Video, Sticker,
  MapPin, Contact, Dice5, Film
} from 'lucide-react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Fase T9: iconos por tipo multimedia
const MEDIA_ICONS: Record<string, React.ReactNode> = {
  photo: <ImageIcon className="w-3 h-3 inline mr-1 text-blue-500" />,
  document: <FileText className="w-3 h-3 inline mr-1 text-blue-500" />,
  voice: <Mic className="w-3 h-3 inline mr-1 text-blue-500" />,
  audio: <Music className="w-3 h-3 inline mr-1 text-blue-500" />,
  video: <Video className="w-3 h-3 inline mr-1 text-blue-500" />,
  video_note: <Video className="w-3 h-3 inline mr-1 text-blue-500" />,
  sticker: <Sticker className="w-3 h-3 inline mr-1 text-blue-500" />,
  animation: <Film className="w-3 h-3 inline mr-1 text-blue-500" />,
  contact: <Contact className="w-3 h-3 inline mr-1 text-blue-500" />,
  location: <MapPin className="w-3 h-3 inline mr-1 text-blue-500" />,
  venue: <MapPin className="w-3 h-3 inline mr-1 text-blue-500" />,
  dice: <Dice5 className="w-3 h-3 inline mr-1 text-blue-500" />,
};

const MEDIA_LABELS: Record<string, string> = {
  photo: 'Foto',
  document: 'Documento',
  voice: 'Mensaje de voz',
  audio: 'Audio',
  video: 'Video',
  video_note: 'Video circular',
  sticker: 'Sticker',
  animation: 'GIF',
  contact: 'Contacto',
  location: 'Ubicación',
  venue: 'Lugar',
  dice: 'Dado',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}min`;
  if (diffHour < 24) return `hace ${diffHour}h`;
  if (diffDay < 7) return `hace ${diffDay}d`;
  return date.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit' });
}

interface Conversation {
  id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  last_message: string;
  last_message_direction: string;
  last_message_at: string;
  unread_count: number;
  is_banned: boolean;
}

interface ChatMessage {
  id: string;
  direction: string;
  content: string;
  created_at: string;
  tokens_used: number | null;
  // Fase T9: campos multimedia
  media_type: string | null;
  caption: string | null;
}

function displayName(c: Conversation): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return name || c.username || String(c.telegram_user_id);
}

function displayInitial(c: Conversation): string {
  return (displayName(c)[0] || '?').toUpperCase();
}

export default function TelegramConversationsView() {
  const { user, token: authToken } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedContact, setSelectedContact] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  // Fase T6: typingFrom se actualizará via Supabase Realtime
  const [typingFrom, setTypingFrom] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/telegram/conversations?store_id=${storeId}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const json = await res.json();
      if (json.data) setConversations(json.data);
    } catch {
      toast.error('Error al cargar conversaciones');
    }
    setLoading(false);
  }, [storeId]);

  const loadMessages = useCallback(async (contactId: string) => {
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('telegram_messages')
      // Fase T9: incluir campos multimedia.
      // NOTA: file_name NO existe como columna en la BD (el nombre del archivo
      // se guarda dentro de raw JSONB si se necesita). Si se pide file_name,
      // Supabase devuelve 400. Por eso no se incluye aquí.
      .select('id, direction, content, created_at, tokens_used, media_type, caption')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      toast.error('Error al cargar mensajes');
    } else {
      setMessages(data || []);
      await supabase
        .from('telegram_messages')
        .update({ read_receipt: true })
        .eq('contact_id', contactId)
        .eq('direction', 'incoming')
        .eq('read_receipt', false);
    }
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    loadConversations();
    // Fase T6: polling reducido a 30s — se reemplazará por Supabase Realtime
    const interval = setInterval(loadConversations, 30000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id);
      const interval = setInterval(() => loadMessages(selectedContact.id), 10000);
      return () => clearInterval(interval);
    }
  }, [selectedContact, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputMessage.trim() || !selectedContact || !storeId) return;
    setSending(true);
    try {
      const res = await fetch('/api/telegram/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          store_id: storeId,
          telegram_user_id: selectedContact.telegram_user_id,
          message: inputMessage,
          contact_id: selectedContact.id,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (!json.sent) toast.info('Bot no conectado — mensaje guardado solo en BD');
        setInputMessage('');
        loadMessages(selectedContact.id);
      } else {
        toast.error('Error al enviar mensaje');
      }
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter(c =>
    !search ||
    displayName(c).toLowerCase().includes(search.toLowerCase()) ||
    String(c.telegram_user_id).includes(search) ||
    c.username?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {/* Lista de conversaciones */}
      <div className={cn('w-full sm:w-80 border-r border-border flex flex-col', selectedContact && 'hidden sm:flex')}>
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-black uppercase tracking-tight mb-2">Conversaciones</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="h-11 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <MessageCircle className="w-8 h-8 opacity-20" />
              <p className="text-xs">Sin conversaciones aún</p>
            </div>
          ) : (
            filteredConversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedContact(conv)}
                className={cn(
                  'w-full flex items-center gap-3 p-3.5 border-b border-border/50 hover:bg-muted/30 transition-colors text-left',
                  selectedContact?.id === conv.id && 'bg-primary/5'
                )}
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {displayInitial(conv)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold truncate">{displayName(conv)}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.last_message_at && (
                        <span className="text-[9px] text-muted-foreground">{timeAgo(conv.last_message_at)}</span>
                      )}
                      {conv.unread_count > 0 && (
                        <Badge className="bg-blue-500 text-white text-[9px] h-4 min-w-4 flex items-center justify-center">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Fase T6: indicador 'escribiendo...' via Supabase Realtime */}
                  {typingFrom === conv.telegram_user_id ? (
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 italic">
                      escribiendo...
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {conv.last_message_direction === 'outgoing' && 'Tú: '}
                      {conv.last_message || 'Sin mensajes'}
                    </p>
                  )}
                </div>
                {conv.is_banned && <Ban className="w-3 h-3 text-destructive shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Visor de mensajes */}
      <div className={cn('flex-1 flex flex-col', !selectedContact && 'hidden sm:flex')}>
        {!selectedContact ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageCircle className="w-12 h-12 opacity-20" />
            <p className="text-sm">Selecciona una conversación</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 border-b border-border bg-card/50">
              <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => setSelectedContact(null)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <span className="text-xs font-bold text-blue-600">{displayInitial(selectedContact)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{displayName(selectedContact)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedContact.username ? `@${selectedContact.username}` : `ID: ${selectedContact.telegram_user_id}`}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p className="text-xs">Sin mensajes</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn(
                      'max-w-[75%] rounded-xl px-3 py-2 text-xs',
                      msg.direction === 'outgoing'
                        ? 'ml-auto bg-blue-600 text-white rounded-br-sm'
                        : 'mr-auto bg-muted text-foreground rounded-bl-sm'
                    )}
                  >
                    {/* Fase T9: mostrar icono + caption si es multimedia */}
                    {msg.media_type && (
                      <div className="flex items-center gap-1 mb-1 opacity-80">
                        {MEDIA_ICONS[msg.media_type] || '📎'}
                        <span className="text-[10px] font-medium">
                          {MEDIA_LABELS[msg.media_type] || 'Archivo'}
                        </span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">
                      {msg.content}
                      {msg.media_type && msg.caption && (
                        <span className="opacity-70 italic ml-1">— {msg.caption}</span>
                      )}
                    </p>
                    <p className={cn('text-[9px] mt-1 opacity-60', msg.direction === 'outgoing' ? 'text-white' : 'text-muted-foreground')}>
                      {new Date(msg.created_at).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
                      {msg.tokens_used && ` · ${msg.tokens_used} tokens`}
                    </p>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-border pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-2">
              <Input
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder={`Mensaje a ${displayName(selectedContact)}…`}
                className="flex-1 text-xs h-11"
                disabled={sending}
              />
              <Button
                onClick={handleSend}
                disabled={sending || !inputMessage.trim()}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shrink-0 min-h-[44px] min-w-[44px]"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
