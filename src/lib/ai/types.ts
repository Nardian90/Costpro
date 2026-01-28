export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface LLMResponse {
  text: string;
  metadata?: any;
}

export interface LLMProvider {
  getResponse(messages: Message[], options?: any): Promise<LLMResponse>;
}
