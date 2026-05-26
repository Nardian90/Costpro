import { z } from 'zod';

// Re-creating the schemas exactly as they are in src/validation/api-schemas.ts
const botMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  tool_calls: z.array(z.record(z.string(), z.unknown())).optional(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
  imageData: z.object({
    mimeType: z.string(),
    data: z.string(),
  }).nullable().optional(),
});

const botChatSchema = z.object({
  message: z.string().min(1).max(4000).optional(),
  messages: z.array(botMessageSchema).optional(),
  conversationId: z.preprocess((val) => (val === '' ? undefined : val), z.string().uuid().optional()),
  context: z.record(z.string(), z.unknown()).optional(),
  aiProvider: z.string().optional(),
  aiApiKey: z.string().optional(),
  model: z.string().optional(),
  storeId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
  temperature: z.number().min(0).max(1).optional(),
  stream: z.boolean().optional(),
});

const payload = {
  messages: [
    {
      role: 'user',
      content: 'hola',
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6',
      timestamp: 1716732300000,
      imageData: null
    }
  ],
  storeId: null,
  aiProvider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.4,
  stream: true,
  context: {
    currentView: 'home',
    uiMode: 'standard'
  }
};

const result = botChatSchema.safeParse(payload);
if (!result.success) {
  console.log('Validation Failed:', JSON.stringify(result.error.issues, null, 2));
} else {
  console.log('Validation Success');
}
