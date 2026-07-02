'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Send, ArrowLeft, Search, Loader2, MessageCircle, Ban } from 'lucide-react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useWhatsAppSocket, type WhatsAppMessageEvent, type WhatsAppTypingEvent } from '@/hooks/whatsapp/useWhatsAppSocket';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
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
  phone_number: string;
  name: string | null;
  push_name: string | null;
  last_message: string;
  last_message_direction: string;
  last_message_at: string;
  unread_count: number;
  is_banned: boolean;
  is_group: boolean;
}

interface ChatMessage {
  id: string;
  direction: string;
  content: string;
  created_at: string;
  tokens_used: number | null;
}

export default function WhatsAppConversationsView() {
  const { user, token } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedContact, setSelectedContact] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  // FASE 5: estado para indicador 'escribiendo...' — phone_number del contacto
  // que está siendo procesado por GLM, o null si ninguno.
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // FASE 5: suscripción a eventos realtime
  const { connected: socketConnected, on } = useWhatsAppSocket({ storeId });

  const loadConversations = useCallback(async () => {
    if (!storeId) return;
    const { data, error } = await supabase
      .from('whatsapp_contacts')
      .select('id, phone_number, name, push_name, last_contact, is_banned, is_group')
      .eq('store_id', storeId)
      .order('last_contact', { ascending: false, nullsFirst: false })
      .limit(100);

    if (error) {
      toast.error('Error al cargar conversaciones');
      setLoading(false);
      return;
    }

    // Obtener último mensaje para cada contacto
    const convs = await Promise.all(
      (data || []).map(async (c) => {
        const { data: lastMsg } = await supabase
          .from('whatsapp_messages')
          .select('content, direction, created_at')
          .eq('contact_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const { count } = await supabase
          .from('whatsapp_messages')
          .select('id', { count: 'exact', head: true })
          .eq('contact_id', c.id)
          .eq('direction', 'incoming')
          .eq('read_receipt', false);

        return {
          ...c,
          last_message: lastMsg?.content || '',
          last_message_direction: lastMsg?.direction || 'incoming',
          last_message_at: lastMsg?.created_at || c.last_contact,
          unread_count: count || 0,
        } as Conversation;
      })
    );

    setConversations(convs);
    setLoading(false);
  }, [storeId]);

  const loadMessages = useCallback(async (contactId: string) => {
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('id, direction, content, created_at, tokens_used')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      toast.error('Error al cargar mensajes');
    } else {
      setMessages(data || []);
      // Marcar mensajes entrantes como leídos
      await supabase
        .from('whatsapp_messages')
        .update({ read_receipt: true })
        .eq('contact_id', contactId)
        .eq('direction', 'incoming')
        .eq('read_receipt', false);
    }
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    loadConversations();
    // FASE 5: el polling cada 10s se elimina — los mensajes nuevos llegan via
    // socket event 'message_incoming'. El refresh manual sigue disponible via
    // toast action o pull-to-refresh en móvil.
    // Solo mantenemos un refresh inicial + cuando el socket se reconecta.
  }, [loadConversations]);

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id);
      // FASE 5: eliminado el polling cada 5s. Los mensajes nuevos llegan via
      // socket event 'message_incoming'/'message_outgoing' y se agregan al estado
      // local sin necesidad de recargar.
    }
  }, [selectedContact, loadMessages]);

  // FASE 5: Suscripción a eventos realtime del socket.
  // message_incoming: nuevo mensaje entrante → agregar a messages si está
  //   seleccionado el contacto, sino actualizar last_message en la lista.
  // message_outgoing: nuevo mensaje saliente → mismo pero para salientes.
  // typing: GLM está procesando → mostrar 'escribiendo...' en el chat activo.
  // typing_stop: GLM terminó → ocultar indicador.
  useEffect(() => {
    const offs: Array<() => void> = [];

    offs.push(on('message_incoming', (ev: WhatsAppMessageEvent) => {
      // Si el mensaje es del contacto seleccionado, agregar a messages
      if (selectedContact && ev.phone_number === selectedContact.phone_number) {
        setMessages(prev => [...prev, {
          id: `realtime-${ev.ts}-${Math.random()}`,
          direction: 'incoming',
          content: ev.content,
          created_at: new Date(ev.ts).toISOString(),
          tokens_used: null,
        }]);
      }
      // Actualizar last_message en la lista de conversaciones
      setConversations(prev => prev.map(c =>
        c.phone_number === ev.phone_number
          ? { ...c, last_message: ev.content, last_message_direction: 'incoming', last_message_at: new Date(ev.ts).toISOString(), unread_count: selectedContact?.phone_number === ev.phone_number ? 0 : c.unread_count + 1 }
          : c
      ));
    }));

    offs.push(on('message_outgoing', (ev: WhatsAppMessageEvent) => {
      if (selectedContact && ev.phone_number === selectedContact.phone_number) {
        setMessages(prev => [...prev, {
          id: `realtime-${ev.ts}-${Math.random()}`,
          direction: 'outgoing',
          content: ev.content,
          created_at: new Date(ev.ts).toISOString(),
          tokens_used: ev.tokens_used || null,
        }]);
      }
      setConversations(prev => prev.map(c =>
        c.phone_number === ev.phone_number
          ? { ...c, last_message: ev.content, last_message_direction: 'outgoing', last_message_at: new Date(ev.ts).toISOString() }
          : c
      ));
    }));

    offs.push(on('typing', (ev: WhatsAppTypingEvent) => {
      setTypingFrom(ev.phone_number);
    }));

    offs.push(on('typing_stop', () => {
      setTypingFrom(null);
    }));

    return () => { offs.forEach(off => off()); };
  }, [on, selectedContact]);

  useEffect(() => {
    // Fix header: usar block: 'nearest' para que scrollIntoView solo mueva
    // el contenedor de mensajes, no toda la página.
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputMessage.trim() || !selectedContact || !storeId) return;
    setSending(true);

    try {
      const res = await fetch('/api/whatsapp/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          phone_number: selectedContact.phone_number,
          message: inputMessage,
          contact_id: selectedContact.id,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (!json.sent) toast.info('WhatsApp no conectado — mensaje guardado solo en BD');
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
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone_number.includes(search) ||
    c.push_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-green-600" />
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
              onChange={(e) => setSearch(e.target.value)}
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
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedContact(conv)}
                className={cn(
                  'w-full flex items-center gap-3 p-3.5 border-b border-border/50 hover:bg-muted/30 transition-colors text-left',
                  selectedContact?.id === conv.id && 'bg-primary/5'
                )}
              >
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-green-600 dark:text-green-400">
                    {(conv.name || conv.push_name || conv.phone_number)[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold truncate">
                      {conv.name || conv.push_name || conv.phone_number}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.last_message_at && (
                        <span className="text-[9px] text-muted-foreground">
                          {timeAgo(conv.last_message_at)}
                        </span>
                      )}
                      {conv.unread_count > 0 && (
                        <Badge className="bg-green-500 text-white text-[9px] h-4 min-w-4 flex items-center justify-center">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* FASE 5: indicador 'escribiendo...' cuando GLM procesa para este contacto */}
                  {typingFrom === conv.phone_number ? (
                    <p className="text-[10px] text-green-600 dark:text-green-400 italic flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
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
            {/* Header del chat */}
            <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 border-b border-border bg-card/50">
              <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => setSelectedContact(null)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <span className="text-xs font-bold text-green-600">
                  {(selectedContact.name || selectedContact.push_name || selectedContact.phone_number)[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">
                  {selectedContact.name || selectedContact.push_name || selectedContact.phone_number}
                </p>
                {/* FASE 5: mostrar estado 'en línea' / 'escribiendo...' / número */}
                {typingFrom === selectedContact.phone_number ? (
                  <p className="text-[10px] text-green-600 dark:text-green-400 italic flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    escribiendo...
                  </p>
                ) : socketConnected ? (
                  <p className="text-[10px] text-green-600 dark:text-green-400">● en línea · {selectedContact.phone_number}</p>
                ) : (
                  <p className="text-[10px] text-muted-foreground">{selectedContact.phone_number}</p>
                )}
              </div>
            </div>

            {/* Mensajes */}
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
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'max-w-[75%] rounded-xl px-3 py-2 text-xs',
                      msg.direction === 'outgoing'
                        ? 'ml-auto bg-green-600 text-white rounded-br-sm'
                        : 'mr-auto bg-muted text-foreground rounded-bl-sm'
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={cn('text-[9px] mt-1 opacity-60', msg.direction === 'outgoing' ? 'text-white' : 'text-muted-foreground')}>
                      {new Date(msg.created_at).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
                      {msg.tokens_used && ` · ${msg.tokens_used} tokens`}
                    </p>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder={`Mensaje a ${selectedContact?.name || selectedContact?.push_name || selectedContact?.phone_number}…`}
                className="flex-1 text-xs h-11"
                disabled={sending}
              />
              <Button
                onClick={handleSend}
                disabled={sending || !inputMessage.trim()}
                size="sm"
                className="bg-green-600 hover:bg-green-700 active:scale-95 text-white shrink-0 min-h-[44px] min-w-[44px]"
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
