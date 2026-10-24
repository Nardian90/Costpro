import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

/**
 * MISIÓN «SISTEMA → SALUD» (2026-10-24) — Interfaz simplificada (FASE B/C/F).
 *
 * Contrato verificado:
 *   1. Solo existen las pestañas Panorama, Conocimiento y Documentación
 *      (Arquitectura, Gobernanza y Ciclo Evolutivo desaparecieron).
 *   2. Navegación entre las tres pestañas sin errores, conservando los datos.
 *   3. Cabecera compacta: título, estado comprobado N/M, versión real y acción
 *      de refresco. SIN eslogan «Observabilidad y Evolución Autónoma», SIN
 *      «v9.0.0» inventado, SIN «Integridad» sin comprobaciones, SIN RAM/CPU.
 *   4. Fallo de una comprobación → estado Degradado + alerta visible con el
 *      detalle real; «Datos anteriores» cuando el refresco falla con lectura
 *      previa válida.
 *   5. Botón deshabilitado durante la comprobación (sin dobles solicitudes).
 */

// next/dynamic → React.lazy + Suspense (GraphViewer no se monta en estos casos,
// pero el import del módulo debe resolver en jsdom).
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    const Component = React.lazy(async () => {
      const mod: any = await loader();
      const resolved = mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod;
      return { default: resolved ?? (() => null) };
    });
    return (props: Record<string, unknown>) => (
      <React.Suspense fallback={null}>
        <Component {...props} />
      </React.Suspense>
    );
  },
}));

import { HealthLayout } from '@/components/views/health/HealthLayout';
import type { HealthData } from '@/components/views/health/hooks/useHealthData';

function fixture(overrides: Partial<HealthData> = {}): HealthData {
  return {
    app: { version: '0.2.0', environment: 'development' },
    generatedAt: '2026-10-24T12:00:00.000Z',
    checks: {
      api: { name: 'API', status: 'ok', latencyMs: 5, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Endpoint operativo' },
      database: { name: 'Base de datos', status: 'ok', latencyMs: 120, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Consulta de solo lectura completada' },
      auth: { name: 'Sesión', status: 'ok', latencyMs: null, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Sesión de administrador validada' },
    },
    checkSummary: { total: 3, passed: 3, failed: 0, status: 'ok' },
    knowledgeSources: [
      {
        name: 'Grafo de conocimiento',
        path: 'knowledge/knowledge_graph.json',
        kind: 'Instantánea estática',
        description: 'Nodos y relaciones de dominio.',
        status: 'ok',
        sizeBytes: 413696,
        lastModified: '2026-09-01T10:00:00.000Z',
      },
    ],
    sourcesSummary: { total: 5, ok: 5, failed: 0 },
    contentSummary: { components: 725, layers: 8, workflows: 12, graphNodes: 462, graphLinks: 2369, appViews: 40 },
    docsList: ['docs/guide.md'],
    docsSummary: { count: 1 },
    ...overrides,
  };
}

function renderLayout(props: Partial<Parameters<typeof HealthLayout>[0]> = {}) {
  const onRefresh = vi.fn();
  const utils = render(
    <HealthLayout
      data={fixture()}
      onRefresh={onRefresh}
      isRefreshing={false}
      refreshState="ok"
      dataStale={false}
      error={null}
      lastRefresh={new Date('2026-10-24T12:00:00')}
      graphData={null}
      graphLoading={false}
      graphError={null}
      onLoadGraph={vi.fn()}
      {...props}
    />
  );
  return { ...utils, onRefresh };
}

describe('Salud — Interfaz simplificada', () => {
  it('1. Solo muestra las pestañas Panorama, Conocimiento y Documentación', () => {
    renderLayout();

    for (const label of ['Panorama', 'Conocimiento', 'Documentación']) {
      expect(screen.getAllByRole('tab', { name: new RegExp(label, 'i') }).length).toBeGreaterThan(0);
    }
    // Pestañas eliminadas por la misión (FASE B).
    for (const removed of ['Arquitectura', 'Gobernanza', 'Ciclo Evolutivo', 'Pipeline de Inteligencia']) {
      expect(screen.queryByText(new RegExp(removed, 'i'))).toBeNull();
    }
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
  });

  it('2. Navega entre las tres pestañas sin errores y conserva los datos', () => {
    renderLayout();

    // Panorama es la pestaña inicial.
    expect(screen.getByText('Comprobaciones ejecutadas')).toBeInTheDocument();

    // Radix Tabs v1.1 activa en mousedown (no en click).
    // → Documentación (el título aparece en el sidebar y en la cabecera del visor)
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Documentación/i }));
    expect(screen.getAllByText('Explorador de Ayuda').length).toBeGreaterThanOrEqual(1);

    // → Conocimiento
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Conocimiento/i }));
    expect(screen.getByText('Fuentes de conocimiento')).toBeInTheDocument();

    // → Panorama (los resultados siguen presentes tras navegar)
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Panorama/i }));
    expect(screen.getByText('Comprobaciones ejecutadas')).toBeInTheDocument();
    expect(screen.getByText('3/3 comprobaciones')).toBeInTheDocument();
  });

  it('3. Cabecera compacta con datos verificados y sin elementos fabricados', () => {
    renderLayout();

    // Título y estado comprobado reales.
    expect(screen.getByText('Salud del Sistema')).toBeInTheDocument();
    expect(screen.getByText('Operativo')).toBeInTheDocument();
    expect(screen.getByText('3/3 comprobaciones')).toBeInTheDocument();
    // Versión REAL de la aplicación (package.json), etiquetada como COSTPRO
    // (aparece en cabecera y en Panorama — «Información comprobada»).
    expect(screen.getAllByText('v0.2.0').length).toBeGreaterThanOrEqual(1);
    // Latencias medidas visibles en la línea de indicadores: la de API se
    // etiqueta como tiempo total de respuesta del endpoint (corrección post-fusión).
    expect(screen.getByText(/Respuesta del endpoint 5 ms/)).toBeInTheDocument();
    expect(screen.getByText(/BD 120 ms/)).toBeInTheDocument();
    // Nota de no-suma entre duración del endpoint y latencia interna de BD.
    expect(screen.getByText(/no deben sumarse/i)).toBeInTheDocument();
    // Botón de refresco presente.
    expect(screen.getByRole('button', { name: /Refrescar núcleo/i })).toBeInTheDocument();

    // Elementos fabricados u obsoletos ELIMINADOS (FASE A → C).
    expect(screen.queryByText(/v9\.0\.0/)).toBeNull();
    expect(screen.queryByText(/Observabilidad y Evolución Autónoma/i)).toBeNull();
    expect(screen.queryByText(/Integridad/i)).toBeNull();
    expect(screen.queryByText(/Sistema Operativo/i)).toBeNull();
    // Métricas del host retiradas de la CABECERA: ni RAM ni CPUs ni uptime.
    // (Panorama puede MENCIONAR RAM/CPU al declararlas «No disponibles».)
    const header = screen.getByRole('banner');
    expect(within(header).queryByText(/RAM/)).toBeNull();
    expect(within(header).queryByText(/CPUs/i)).toBeNull();
    expect(within(header).queryByText(/uptime/i)).toBeNull();
  });

  it('4a. Comprobación de BD fallida → Degradado 2/3 con alerta y detalle público saneado', () => {
    renderLayout({
      data: fixture({
        checks: {
          api: { name: 'API', status: 'ok', latencyMs: 5, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Respuesta del endpoint: tiempo total de procesamiento (incluye la comprobación de BD)' },
          database: { name: 'Base de datos', status: 'error', latencyMs: null, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'No se pudo conectar con la base de datos (categoría: conectividad)' },
          auth: { name: 'Sesión', status: 'ok', latencyMs: null, checkedAt: '2026-10-24T12:00:00.000Z', detail: 'Sesión de administrador validada' },
        },
        checkSummary: { total: 3, passed: 2, failed: 1, status: 'degraded' },
      }),
      refreshState: 'partial',
    });

    expect(screen.getByText('Degradado')).toBeInTheDocument();
    expect(screen.getByText('2/3 comprobaciones')).toBeInTheDocument();
    // Al menos una alerta (cabecera y/o Panorama) cita la comprobación fallida
    // y su detalle público (nada de «éxito», nada de texto interno del proveedor).
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const withDetail = alerts.filter((el) => /no se pudo conectar con la base de datos/i.test(el.textContent ?? ''));
    expect(withDetail.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Actualizado parcialmente')).toBeInTheDocument();
  });

  it('4b. Refresco fallido con lectura previa válida → «Datos anteriores» y error visible', () => {
    renderLayout({
      refreshState: 'failed',
      dataStale: true,
      error: 'Error 500: Internal Server Error',
    });

    expect(screen.getByText('Datos anteriores')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/Error 500: Internal Server Error/)).toBeInTheDocument();
    expect(within(alert).getByText(/no pudo completarse/i)).toBeInTheDocument();
  });

  it('5. El botón queda deshabilitado durante la comprobación', () => {
    renderLayout({ isRefreshing: true, refreshState: 'refreshing' });

    const button = screen.getByRole('button', { name: /Comprobando/i });
    expect(button).toBeDisabled();
  });

  it('6. Panorama declara explícitamente lo que NO está disponible', () => {
    renderLayout();
    expect(screen.getByText('No disponible en esta vista')).toBeInTheDocument();
    expect(screen.getByText(/Recursos del servidor \(RAM, CPU, tiempo de actividad\)/)).toBeInTheDocument();
  });

  it('7. Métrica de documentación precisa: archivos disponibles, sin indexación ni objetivo arbitrario', () => {
    renderLayout();

    // Título preciso: recuento real de archivos .md, no «documentos indexados».
    expect(screen.getByText('Archivos Markdown disponibles')).toBeInTheDocument();
    // Sin barra de progreso con objetivo arbitrario: solo las 2 tarjetas con
    // ratios reales (Comprobaciones 3/3, Fuentes 5/5) renderizan barra.
    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBe(2);
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['100', '100']);
    // El recuento real sigue visible en la tarjeta y en «Información comprobada».
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/1 archivos Markdown enumerados/i)).toBeInTheDocument();

    // La pestaña Documentación tampoco afirma indexación (Radix activa en mousedown).
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Documentación/i }));
    expect(screen.getByText(/Archivos Markdown disponibles/i)).toBeInTheDocument();
    expect(screen.queryByText(/indexad/i)).toBeNull();
  });
});
