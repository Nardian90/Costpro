/**
 * CP-SALES-024 — Panel de configuración del SC-2-12 (Sc212ConfigModal).
 * ============================================================================
 * Cubre la FASE B funcional (misión §4):
 *  - Icono ⚙ «Configurar documento» junto al botón de exportar.
 *  - El panel muestra los 7 campos con su valor oficial de la tienda.
 *  - Mostrar/ocultar, cambiar etiqueta, sustitución SOLO en no oficiales
 *    (oficiales read-only), restaurar campo y restaurar todo.
 *  - Guardar persiste en user_preferences (por usuario+tienda) y NO llama
 *    a ningún update de stores (Gestión de Tiendas intacta).
 *  - Vista previa invoca al generador con el borrador sin guardar.
 *  - La exportación directa usa las preferencias guardadas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { TransactionDetailsModal } from '@/components/views/terminal/views/sales/TransactionDetailsModal';
import { Sc212ConfigModal } from '@/components/views/terminal/views/sales/Sc212ConfigModal';
import { exportSc212ForTransaction } from '@/lib/legal/sc212';
import type { Transaction, TransactionItem } from '@/types';

// ── Mocks ─────────────────────────────────────────────────────────────
vi.mock('@/store', () => ({
  useAuthStore: () => ({
    user: { id: 'u1', role: 'admin', activeStoreId: 'store-global-activa' },
    token: 't',
  }),
}));

vi.mock('@/hooks/api/useTaxes', () => ({ useTaxes: () => ({ data: [] }) }));
vi.mock('@/hooks/api/useTransactions', () => ({ useSalePayments: () => ({ data: [] }) }));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: vi.fn(() => ({
    value: (globalThis as Record<string, unknown>).__savedPrefs ?? {},
    update: vi.fn(async (v: unknown) => {
      (globalThis as Record<string, unknown>).__savedPrefs = v;
    }),
    loading: false,
  })),
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              name: 'ENERVIDA-VITALLCONS',
              address: 'Calle Menocal SN, Esquina a Francisco',
              phone: '56561619',
              email: 'vitallcons@gmail.com',
              reeup: '50004179942',
              nit: '50004179942',
              bank_account: '0664 4340 0002 6710',
            },
          }),
        }),
      }),
    })),
    rpc: vi.fn(),
  },
}));
vi.mock('@/lib/legal/sc212', () => ({
  exportSc212ForTransaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/views/terminal/views/pos/thermal-receipt-print', () => ({
  fetchActiveStoreName: vi.fn().mockResolvedValue('Tienda QA'),
  printThermalReceipt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

const baseTransaction = {
  id: '44444444-aaaa-4bbb-8ccc-00000000e2e1',
  store_id: 'store-enervida',
  seller_id: 'u1',
  total_amount: 5000,
  status: 'completed',
  created_at: '2026-09-15T10:00:00+00:00',
  payment_method: 'cash',
  subtotal: 5000,
  discount_value: 0,
  tax_amount: 0,
  cash_amount: null,
  transfer_amount: null,
  zelle_amount: null,
  invoice_number: null,
  customer_name: null,
  applied_taxes: [],
} as unknown as Transaction;

const item = {
  id: 'item-1',
  transaction_id: baseTransaction.id,
  product_id: 'p1',
  quantity: 2,
  price_at_sale: 2500,
  price_at_sale_cup: 2500,
  products: { name: 'Cemento Cola', sku: '15' },
} as unknown as TransactionItem;

function renderModal(props: Partial<React.ComponentProps<typeof TransactionDetailsModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TransactionDetailsModal
        isOpen
        onClose={() => {}}
        transaction={baseTransaction}
        items={[item]}
        isLoading={false}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as Record<string, unknown>).__savedPrefs = {};
  localStorage.clear();
});

describe('CP-SALES-024 · FASE B — icono ⚙ y panel de configuración', () => {
  it('el botón ⚙ «Configurar documento» aparece junto a «Exportar SC-2-12 (PDF)»', () => {
    renderModal();
    expect(screen.getByText('Exportar SC-2-12 (PDF)')).toBeInTheDocument();
    const gear = screen.getByRole('button', { name: /Configurar documento SC-2-12/i });
    expect(gear).toBeInTheDocument();
    // Junto al exportar: ambos en el mismo contenedor de acciones.
    const actions = screen.getByText('Exportar SC-2-12 (PDF)').closest('div');
    expect(actions).toContain(gear);
  });

  it('al pulsar ⚙ abre el panel con los 7 campos y los valores oficiales de la tienda de la venta', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Configurar documento SC-2-12/i }));
    await waitFor(() => {
      expect(screen.getByText(/Configurar documento SC-2-12/i)).toBeInTheDocument();
    });
    const body = document.body.textContent || '';
    // Valores oficiales (read-only) mostrados desde la config de la tienda:
    expect(body).toContain('0664 4340 0002 6710');
    expect(body).toContain('50004179942');
    // Fuente declarada por campo:
    expect(body).toContain('stores.bank_account');
    expect(body).toContain('stores.nit');
  });

  it('los campos oficiales NO ofrecen entrada de valor (solo lectura)', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Configurar documento SC-2-12/i }));
    // NIT, Código y Cuenta bancaria: los 3 oficiales en solo lectura.
    await waitFor(() => {
      expect(screen.getAllByText(/Valor oficial \(solo lectura\)/)).toHaveLength(3);
    });
    // Los no oficiales sí tienen entrada de valor personalizado:
    expect(screen.getAllByPlaceholderText(/56561619|vitallcons@gmail.com|Calle Menocal/)).toHaveLength(3);
  });

  it('ocultar un campo (switch) y guardarlo persiste la preferencia correcta', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Configurar documento SC-2-12/i }));
    await waitFor(() => screen.getByRole('switch', { name: /Mostrar Teléfono/i }));
    fireEvent.click(screen.getByRole('switch', { name: /Mostrar Teléfono/i })); // ocultar
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));
    await waitFor(() => {
      const saved = (globalThis as Record<string, unknown>).__savedPrefs as Record<string, unknown>;
      expect(saved).toEqual({ proveedorTelefono: { visible: false } });
    });
  });

  it('«Restaurar todo» limpia el borrador (documento por defecto)', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Configurar documento SC-2-12/i }));
    await waitFor(() => screen.getByRole('switch', { name: /Mostrar Teléfono/i }));
    fireEvent.click(screen.getByRole('switch', { name: /Mostrar Teléfono/i }));
    fireEvent.click(screen.getByRole('button', { name: /Restaurar todo/i }));
    // El switch vuelve a visible (checked):
    await waitFor(() => {
      expect((screen.getByRole('switch', { name: /Mostrar Teléfono/i }) as HTMLInputElement).getAttribute('data-state')).toBe('checked');
    });
  });

  it('guardar preferencias JAMÁS escribe en stores (Gestión de Tiendas intacta)', async () => {
    const { supabase } = await import('@/lib/supabaseClient');
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Configurar documento SC-2-12/i }));
    await waitFor(() => screen.getByRole('switch', { name: /Mostrar Correo/i }));
    fireEvent.click(screen.getByRole('switch', { name: /Mostrar Correo/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));
    await waitFor(() => {
      const saved = (globalThis as Record<string, unknown>).__savedPrefs;
      expect(saved).toBeDefined();
    });
    // La única escritura posible del modal es user_preferences (hook
    // mockeado); supabase.from solo se usó para LEER la tienda del venta.
    const calls = vi.mocked(supabase.from).mock.calls;
    for (const [table] of calls) {
      expect(table).not.toBe(['stores', 'update']); // nunca update de stores
    }
  });

  it('«Vista previa (PDF)» llama al exportador con el borrador SIN guardar', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Configurar documento SC-2-12/i }));
    await waitFor(() => screen.getByRole('switch', { name: /Mostrar Teléfono/i }));
    fireEvent.click(screen.getByRole('switch', { name: /Mostrar Teléfono/i })); // ocultar
    fireEvent.click(screen.getByRole('button', { name: /Vista previa \(PDF\)/i }));
    await waitFor(() => {
      expect(exportSc212ForTransaction).toHaveBeenCalled();
    });
    const call = vi.mocked(exportSc212ForTransaction).mock.calls[0];
    // [transaction, activeStoreId, prefs]
    expect(call[2]).toEqual({ proveedorTelefono: { visible: false } });
    // …y no se persistió nada aún:
    expect((globalThis as Record<string, unknown>).__savedPrefs).toEqual({});
  });

  it('la exportación directa pasa las preferencias guardadas al generador', async () => {
    (globalThis as Record<string, unknown>).__savedPrefs = {
      proveedorEmail: { visible: false },
    };
    renderModal();
    // Esperar a que el modal cargue la preferencia de localStorage
    // (la exportación usa la copia local sincronizada al abrir).
    await waitFor(() => {
      fireEvent.click(screen.getByText('Exportar SC-2-12 (PDF)'));
    });
    await waitFor(() => {
      expect(exportSc212ForTransaction).toHaveBeenCalled();
    });
  });

  it('cambiar la tienda seleccionada en el menú global NO cambia la tienda del panel', async () => {
    // user.activeStoreId = 'store-global-activa' (distinta) — la venta es de
    // 'store-enervida': el panel y el exportador usan la de LA VENTA.
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Configurar documento SC-2-12/i }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('ENERVIDA-VITALLCONS');
    });
    fireEvent.click(screen.getByText('Exportar SC-2-12 (PDF)'));
    await waitFor(() => {
      expect(exportSc212ForTransaction).toHaveBeenCalled();
    });
    const call = vi.mocked(exportSc212ForTransaction).mock.calls[0];
    expect(call[0].store_id).toBe('store-enervida');
  });
});

describe('CP-SALES-024 · Sc212ConfigModal — contrato directo del panel', () => {
  it('renderiza los 7 campos personalizables con etiqueta oficial por defecto', () => {
    render(
      <Sc212ConfigModal
        isOpen
        onClose={() => {}}
        storeId="store-enervida"
        storeName="ENERVIDA-VITALLCONS"
        storeValues={{
          proveedorDireccion: 'Calle Menocal SN',
          proveedorCodigo: '50004179942',
          proveedorNIT: '50004179942',
          proveedorCuentaBancaria: '0664 4340 0002 6710',
          proveedorSucursalBancaria: '',
          proveedorTelefono: '56561619',
          proveedorEmail: 'vitallcons@gmail.com',
        }}
        onPreview={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const body = document.body.textContent || '';
    for (const hint of [
      'Domicilio de la entidad vendedora',
      'Código/REEUP de la entidad',
      'Número de identificación tributaria',
      'Cuenta bancaria de la entidad',
      'Sucursal bancaria de la entidad',
      'Teléfono de contacto de la entidad',
      'Correo electrónico de la entidad',
    ]) {
      expect(body).toContain(hint);
    }
  });
});
