// Verificar el problema con un test mínimo
import { vi } from 'vitest';

// Mock
vi.mock('@/lib/whatsapp/realtime-server', () => ({
  emitToStore: vi.fn(),
  emitMessage: vi.fn(),
  emitTyping: vi.fn(),
}));

// Import relativo
const mod1 = await import('@/lib/whatsapp/realtime-server');
console.log('mod1.emitToStore:', typeof mod1.emitToStore);
console.log('mod1.emitToStore._isMockFunction:', (mod1.emitToStore as any)?._isMockFunction);

// Importar handlers.ts que importa './realtime-server'
const handlers = await import('@/lib/whatsapp/handlers');
console.log('handlers loaded');
