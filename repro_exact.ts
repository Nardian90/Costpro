import { z } from 'zod';
import { botChatSchema } from './full_schemas';
const payload = {
  messages: [{
    role: 'user',
    content: 'hola',
    id: 'uuid',
    timestamp: 123
  }],
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
const res = botChatSchema.safeParse(payload);
console.log('Success:', res.success);
if (!res.success) console.log(JSON.stringify(res.error.issues, null, 2));
