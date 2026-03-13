export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  allowedRoles?: string[];
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface LLMResponse {
  text: string;
  tool_calls?: ToolCall[];
  metadata?: {
    model?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    keySource?: string;
    [key: string]: any;
  };
}

export interface LLMProvider {
  getResponse(messages: Message[], options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: ToolDefinition[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  }): Promise<LLMResponse>;
}

export interface AIAction {
  type: 'navigation' | 'form_fill' | 'form_submit' | 'system_action' | 'export' | 'ui_mode';
  payload: any;
  metadata?: {
    model?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    keySource?: string;
    [key: string]: any;
  };
}

export interface BotContext {
  userId: string;
  companyId?: string;
  storeId: string;
  currentView?: string;
  activeRecordId?: string;
  uiMode?: 'standard' | 'expert';
  [key: string]: any;
}
