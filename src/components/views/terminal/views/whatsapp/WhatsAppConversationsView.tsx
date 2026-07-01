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
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedContact, setSelectedContact] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    }
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id);
      const interval = setInterval(() => loadMessages(selectedContact.id), 5000);
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
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
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
                  'w-full flex items-center gap-3 p-3 border-b border-border/50 hover:bg-muted/30 transition-colors text-left',
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
                    {conv.unread_count > 0 && (
                      <Badge className="bg-green-500 text-white text-[9px] h-4 min-w-4 flex items-center justify-center">
                        {conv.unread_count}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {conv.last_message_direction === 'outgoing' && 'Tú: '}
                    {conv.last_message || 'Sin mensajes'}
                  </p>
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
            <div className="flex items-center gap-3 p-3 border-b border-border bg-card/50">
              <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setSelectedContact(null)}>
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
                <p className="text-[10px] text-muted-foreground">{selectedContact.phone_number}</p>
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
            <div className="p-3 border-t border-border flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder="Escribe un mensaje…"
                className="flex-1 text-xs"
                disabled={sending}
              />
              <Button
                onClick={handleSend}
                disabled={sending || !inputMessage.trim()}
                size="icon"
                className="bg-green-600 hover:bg-green-700 text-white shrink-0"
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
