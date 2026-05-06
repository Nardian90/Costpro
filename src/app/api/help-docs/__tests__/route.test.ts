import { NextRequest } from 'next/server';
import { GET } from '../route';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoisted) ─────────────────────────────────────────────────────────

const { mockExistsSync, mockReadFileSync, mockReaddirSync, mockStatSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: 'u1' }, token: 't1' }),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listado de estructura (sin parámetros)', () => {
    it('retorna la estructura de archivos del sistema de ayuda', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['guide.md']);
      mockReadFileSync.mockReturnValue('# Guía General\n\nContenido de prueba.');

      const req = makeRequest({});
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toHaveProperty('iso_manual');
      expect(json).toHaveProperty('docs');
      expect(json.docs).toHaveProperty('tutorials');
      expect(json.docs).toHaveProperty('howTo');
      expect(json.docs).toHaveProperty('reference');
      expect(json.docs).toHaveProperty('explanation');
    });

    it('extrae el título del primer encabezado de cada archivo', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['intro.md']);
      mockReadFileSync.mockReturnValue('# Introducción al Sistema\n\nTexto.');

      const req = makeRequest({});
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      const entries = json.iso_manual;
      expect(entries[0].title).toBe('Introducción al Sistema');
    });

    it('retorna arreglos vacíos cuando los directorios no existen', async () => {
      mockExistsSync.mockReturnValue(false);

      const req = makeRequest({});
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.iso_manual).toEqual([]);
      expect(json.docs.tutorials).toEqual([]);
      expect(json.docs.howTo).toEqual([]);
      expect(json.docs.reference).toEqual([]);
      expect(json.docs.explanation).toEqual([]);
    });
  });

  describe('búsqueda de contenido', () => {
    it('retorna resultados cuando la búsqueda coincide con contenido', async () => {
      const markdownContent = '# Guía de Inventarios\n\nEste documento cubre la gestión de inventarios en el sistema.\nAyuda a los usuarios a administrar productos.';
      mockReaddirSync.mockReturnValue(['inventarios.md']);
      mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
      mockReadFileSync.mockReturnValue(markdownContent);

      const req = makeRequest({ search: 'inventario' });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.results).toBeDefined();
      expect(json.results.length).toBeGreaterThan(0);
      expect(json.results[0]).toHaveProperty('path');
      expect(json.results[0]).toHaveProperty('title');
      expect(json.results[0]).toHaveProperty('excerpt');
      expect(json.results[0]).toHaveProperty('type');
    });

    it('no busca si el query tiene menos de 3 caracteres', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      const req = makeRequest({ search: 'ab' });
      const res = await GET(req);
      const json = await res.json();

      // Short query falls through to the listing branch
      expect(res.status).toBe(200);
      expect(json).toHaveProperty('iso_manual');
      expect(json.results).toBeUndefined();
    });

    it('limita los resultados a 10 elementos', async () => {
      const files = Array.from({ length: 15 }, (_, i) => `file${i}.md`);
      const content = 'inventario repetido en cada archivo';
      mockReaddirSync.mockReturnValue(files);
      mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
      mockReadFileSync.mockReturnValue(`# Archivo ${content}`);

      const req = makeRequest({ search: 'inventario' });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('lectura de archivo específico', () => {
    it('retorna 404 cuando el archivo no existe', async () => {
      mockExistsSync.mockReturnValue(false);

      const req = makeRequest({ path: 'nonexistent.md' });
      const res = await GET(req);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toMatch(/not found/i);
    });

    it('retorna 400 cuando la ruta es un directorio', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any);

      const req = makeRequest({ path: 'some-dir' });
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/directory/i);
    });

    it('retorna el contenido de un archivo markdown', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
      mockReadFileSync.mockReturnValue('# Documento de Prueba\n\nContenido del documento.');

      const req = makeRequest({ path: 'docs/prueba.md' });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.content).toBe('# Documento de Prueba\n\nContenido del documento.');
    });

    it('parsea y retorna archivos JSON directamente', async () => {
      const jsonData = { help_entries: [{ title: 'FAQ' }] };
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
      mockReadFileSync.mockReturnValue(JSON.stringify(jsonData));

      const req = makeRequest({ path: 'user_help.json' });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.help_entries).toBeDefined();
      expect(json.help_entries[0].title).toBe('FAQ');
    });

    it('retorna 500 cuando ocurre un error inesperado', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permiso denegado');
      });

      const req = makeRequest({ path: 'broken.md' });
      const res = await GET(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toMatch(/internal server error/i);
    });
  });
});
