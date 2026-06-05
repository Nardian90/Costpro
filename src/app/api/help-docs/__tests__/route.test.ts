import { NextRequest } from 'next/server';
import { GET } from '../route';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoisted) ─────────────────────────────────────────────────────────

const { mockExistsSync, mockReadFileSync, mockReaddirSync, mockStatSync, mockGetServerSession } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockGetServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  __esModule: true,
  getServerSession: mockGetServerSession,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeRequest = (searchParams: Record<string, string>) => {
  const url = new URL('http://localhost/api/help-docs');
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/help-docs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/mock');
    mockGetServerSession.mockResolvedValue({ user: { id: 'u1' } });
    // Default mock behavior
    mockStatSync.mockReturnValue({ isDirectory: () => false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listado de estructura (sin parámetros)', () => {
    it('retorna la estructura de archivos del sistema de ayuda', async () => {
      mockExistsSync.mockReturnValue(true);
      // Mock sections directory
      mockReaddirSync.mockImplementation((path) => {
        if (path.endsWith('help')) return ['01-empezar'];
        if (path.includes('01-empezar')) return ['intro.md'];
        if (path.includes('compliance')) return [];
        return [];
      });
      mockStatSync.mockImplementation((path) => {
        if (path.endsWith('01-empezar')) return { isDirectory: () => true };
        return { isDirectory: () => false };
      });
      mockReadFileSync.mockReturnValue('# Introducción\n\nContenido.');

      const req = makeRequest({});
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toHaveProperty('sections');
      expect(json).toHaveProperty('compliance');
      expect(json.sections).toHaveLength(1);
      expect(json.sections[0].files[0].title).toBe('Introducción');
    });

    it('retorna arreglos vacíos cuando los directorios no existen', async () => {
      mockExistsSync.mockReturnValue(false);

      const req = makeRequest({});
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.sections).toEqual([]);
      expect(json.compliance.files).toEqual([]);
    });
  });

  describe('búsqueda de contenido', () => {
    it('retorna resultados cuando la búsqueda coincide con contenido', async () => {
      const markdownContent = '# Guía de Inventarios\n\nEste documento cubre la gestión de inventarios.';
      mockReaddirSync.mockReturnValue(['inventarios.md']);
      mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
      mockReadFileSync.mockReturnValue(markdownContent);

      const req = makeRequest({ search: 'inventario' });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.results).toBeDefined();
      expect(json.results.length).toBeGreaterThan(0);
    });

    it('no busca si el query tiene menos de 3 caracteres', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      const req = makeRequest({ search: 'ab' });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toHaveProperty('sections');
      expect(json.results).toBeUndefined();
    });
  });

  describe('lectura de archivo específico', () => {
    it('retorna 404 cuando el archivo no existe', async () => {
      mockExistsSync.mockReturnValue(false);

      const req = makeRequest({ path: 'nonexistent.md' });
      const res = await GET(req);

      expect(res.status).toBe(404);
    });

    it('retorna el contenido de un archivo markdown', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
      mockReadFileSync.mockReturnValue('# Titulo\n\nContenido');

      const req = makeRequest({ path: 'help/01-empezar/intro.md' });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.content).toBe('# Titulo\n\nContenido');
    });

    it('retorna 500 cuando ocurre un error inesperado', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Crash');
      });

      const req = makeRequest({ path: 'broken.md' });
      const res = await GET(req);

      expect(res.status).toBe(500);
    });
  });
});
