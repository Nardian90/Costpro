/**
 * CP-SALES-024 — Batería de contrato del SC-2-12 (CI, sin red).
 * ============================================================================
 * Cubre los tres frentes de la misión:
 *
 *  A. Integración de datos: el modelo toma la identificación de la tienda de
 *     LA VENTA (store_id) — mapeo explícito stores → SC-2-12, sin valores
 *     estáticos, sin undefined, formato intacto (cuenta bancaria con
 *     espacios, teléfonos, REEUP).
 *  B. Personalización de presentación: mostrar/ocultar, etiquetas,
 *     sustitución SOLO en campos no oficiales, restauración; la preferencia
 *     nunca altera el dato fuente.
 *  C. Leyenda genérica: «Entrega los productos (nombre y firma)» — sin
 *     nombre del vendedor («David») ni del usuario autenticado.
 *
 * Además: render real del PDF (texto decodificado) verificando que los
 * datos de la tienda aparecen, que los campos ocultos no dejan etiqueta
 * huérfana y que la cuenta bancaria conserva sus espacios.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildSc212ModelData,
  renderSc212Pdf,
  sc212PresentationOf,
  type Sc212SourceData,
} from '@/lib/legal/sc212';
import {
  normalizeSc212Prefs,
  resolveSc212Field,
  sc212PrefsKey,
  SC212_FIELDS,
  DEFAULT_SC212_FIELD_LABELS,
} from '@/lib/legal/sc212-config/fields';

// ── Decodificador de texto del PDF: extrae las cadenas de los operadores
//    Tj/TJ del stream latin1, des-escapa paréntesis y une con espacios
//    (jsPDF parte los textos con maxWidth en varios Tj — al unirlos, las
//    frases largas quedan contiguas). ──
function decodePdf(bytes: ArrayBuffer): string {
  const raw = new TextDecoder('latin1').decode(bytes);
  const out: string[] = [];
  const re = /\((?:\\.|[^\\()])*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out.push(m[0].slice(1, -1).replace(/\\([()\\])/g, '$1'));
  }
  return out.join(' ');
}

const VENTA_BASE: Sc212SourceData['transaction'] = {
  id: 'eeeeeeee-5555-4555-8555-555555555555',
  status: 'completed',
  total_amount: 5487.3,
  subtotal: 5680,
  discount_value: 192.7,
  sale_currency: 'CUP',
  customer_name: 'Combinado Deportivo',
  invoice_number: 'FV-2026-003412',
  completed_at: '2026-10-27T11:45:00Z',
  created_at: '2026-10-27T11:45:00Z',
  seller_id: 'seller-1',
  store_id: 'store-enervida',
};

const CONFIG_ENERVIDA = {
  address: 'Calle Menocal SN, Esquina a Francisco',
  phone: '56561619',
  email: 'vitallcons@gmail.com',
  reeup: '50004179942',
  nit: '50004179942',
  bank_account: '0664 4340 0002 6710',
  bank_branch: 'BPA Las Tunas — Sucursal Centro',
};

const sourceEnervida: Sc212SourceData = {
  transaction: VENTA_BASE,
  items: [
    {
      quantity: 12,
      price_at_sale: 210,
      price_currency: 'CUP',
      products: { name: 'Aceite 1 L', sku: 'ACE-1L', unit_of_measure: 'unidades' },
    },
  ],
  entidadNombre: 'ENERVIDA-VITALLCONS',
  vendedorNombre: 'David', // el vendedor REAL se llama David — no debe salir
  storeConfig: CONFIG_ENERVIDA,
};

describe('CP-SALES-024 · A — Integración con la configuración de la tienda', () => {
  it('mapea los 7 campos de stores a los datos del proveedor SC-2-12', () => {
    const model = buildSc212ModelData(sourceEnervida);
    expect(model.proveedorNombre).toBe('ENERVIDA-VITALLCONS');   // stores.name
    expect(model.proveedorDireccion).toBe(CONFIG_ENERVIDA.address); // stores.address
    expect(model.proveedorCodigo).toBe(CONFIG_ENERVIDA.reeup);   // stores.reeup (código)
    expect(model.proveedorNIT).toBe(CONFIG_ENERVIDA.nit);        // stores.nit
    expect(model.proveedorCuentaBancaria).toBe(CONFIG_ENERVIDA.bank_account); // stores.bank_account
    // CP-STORES-BANK-BRANCH (Objetivo A): la sucursal bancaria ahora ES
    // gestionada por la tienda — valor real, jamás inventado.
    expect(model.proveedorSucursalBancaria).toBe(CONFIG_ENERVIDA.bank_branch); // stores.bank_branch
    // Contacto (banda del proveedor, añadidos por COSTPRO):
    const pres = sc212PresentationOf(model);
    expect(pres.proveedorTelefono.value).toBe(CONFIG_ENERVIDA.phone);
    expect(pres.proveedorEmail.value).toBe(CONFIG_ENERVIDA.email);
  });

  it('la cuenta bancaria conserva dígitos y espacios exactos (0664 4340 0002 6710)', () => {
    const model = buildSc212ModelData(sourceEnervida);
    expect(model.proveedorCuentaBancaria).toMatch(/^0664 4340 0002 6710$/);
  });

  it('sin storeConfig (fuente legacy) degrada a blanco, nunca undefined ni inventado', () => {
    const model = buildSc212ModelData({
      ...sourceEnervida,
      storeConfig: null,
    });
    expect(model.proveedorDireccion).toBe('');
    expect(model.proveedorNIT).toBe('');
    expect(model.proveedorCuentaBancaria).toBe('');
    const pres = sc212PresentationOf(model);
    expect(pres.proveedorTelefono.value).toBe('');
    for (const f of SC212_FIELDS) {
      expect(pres[f.id].value).not.toContain('undefined');
      expect(pres[f.id].value).not.toContain('null');
    }
  });

  it('campos vacíos en la configuración NO desplazan los demás (banda empaquetada)', () => {
    const model = buildSc212ModelData({
      ...sourceEnervida,
      storeConfig: { ...CONFIG_ENERVIDA, address: null, phone: '', email: null },
    });
    const pres = sc212PresentationOf(model);
    // Los presentes siguen con su valor; los ausentes en blanco (no se
    // rellenan con el vecino ni se inventan).
    expect(pres.proveedorDireccion.value).toBe('');
    expect(pres.proveedorCodigo.value).toBe(CONFIG_ENERVIDA.reeup);
    expect(pres.proveedorNIT.value).toBe(CONFIG_ENERVIDA.nit);
    expect(pres.proveedorCuentaBancaria.value).toBe(CONFIG_ENERVIDA.bank_account);
    expect(pres.proveedorTelefono.value).toBe('');
    expect(pres.proveedorEmail.value).toBe('');
  });

  it('una venta de OTRA tienda lleva SOLO los datos de esa otra tienda (aislamiento del modelo)', () => {
    const sourcePuertoPadre: Sc212SourceData = {
      ...sourceEnervida,
      transaction: { ...VENTA_BASE, store_id: 'store-puerto-padre' },
      entidadNombre: 'Puerto Padre',
      storeConfig: {
        address: 'Calle Marta Abreu 12',
        phone: '24412345',
        email: 'pp@tienda.cu',
        reeup: '41004179942',
        nit: '41004179943',
        bank_account: '0110 0000 1111 2222',
        bank_branch: 'BANDEC Puerto Padre',
      },
    };
    const modelA = buildSc212ModelData(sourceEnervida);
    const modelB = buildSc212ModelData(sourcePuertoPadre);
    // Ningún dato de ENERVIDA aparece en el documento de Puerto Padre.
    expect(modelB.proveedorNombre).toBe('Puerto Padre');
    expect(modelB.proveedorNIT).toBe('41004179943');
    expect(modelB.proveedorNIT).not.toBe(modelA.proveedorNIT);
    expect(modelB.proveedorCuentaBancaria).toBe('0110 0000 1111 2222');
    expect(modelB.proveedorSucursalBancaria).toBe('BANDEC Puerto Padre');
    expect(modelB.proveedorSucursalBancaria).not.toBe(modelA.proveedorSucursalBancaria);
    expect(modelB.proveedorDireccion).toBe('Calle Marta Abreu 12');
  });

  it('el fetch consulta la tienda por el store_id de la VENTA (no la activa global)', async () => {
    const { supabase } = await import('@/lib/supabaseClient');
    const { fetchSc212SourceData } = await import('@/lib/legal/sc212');
    const capturedEq: string[] = [];
    // Cadena de consulta Supabase falsa: cada método devuelve el mismo nodo
    // (fluido) y el nodo es un thenable correcto (await → {data,error}).
    const makeNode = (): Record<string, unknown> => {
      const node: Record<string, unknown> = {};
      node.select = vi.fn(() => node);
      node.eq = vi.fn((_c: string, val: string) => {
        capturedEq.push(val);
        return node;
      });
      node.order = vi.fn(() => node);
      node.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      node.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(onFulfilled);
      return node;
    };
    const fromSpy = vi
      .spyOn(supabase, 'from')
      .mockImplementation(() => makeNode() as never);

    try {
      // Venta de ENERVIDA con tienda ACTIVA global distinta (Puerto Padre):
      // el fetch DEBE consultar la tienda de la venta, no la del menú.
      await fetchSc212SourceData(
        { ...VENTA_BASE, store_id: 'store-enervida' },
        'store-puerto-padre',
      );
      expect(capturedEq).toContain('store-enervida');
      expect(capturedEq).not.toContain('store-puerto-padre');
    } finally {
      fromSpy.mockRestore();
    }
  });
});

describe('CP-SALES-024 · B — Personalización de presentación', () => {
  it('ocultar un campo lo excluye de la presentación (sin hueco ni etiqueta)', () => {
    const prefs = normalizeSc212Prefs({
      proveedorCuentaBancaria: { visible: false },
    });
    const model = buildSc212ModelData(sourceEnervida, prefs);
    const pres = sc212PresentationOf(model);
    expect(pres.proveedorCuentaBancaria.visible).toBe(false);
    // El dato fuente sigue intacto en el modelo — solo se deja de dibujar:
    expect(model.proveedorCuentaBancaria).toBe(CONFIG_ENERVIDA.bank_account);
  });

  it('cambiar la etiqueta NO cambia el valor fuente', () => {
    const prefs = normalizeSc212Prefs({
      proveedorNIT: { label: 'N.I.T. entidad' },
    });
    const f = SC212_FIELDS.find((x) => x.id === 'proveedorNIT')!;
    const r = resolveSc212Field(prefs, f, CONFIG_ENERVIDA.nit);
    expect(r.label).toBe('N.I.T. entidad');
    expect(r.value).toBe(CONFIG_ENERVIDA.nit);
  });

  it('los campos OFICIALES (REEUP/NIT/cuenta) rechazan sustitución de valor', () => {
    const prefs = normalizeSc212Prefs({
      proveedorNIT: { value: '99999999999' },
      proveedorCodigo: { value: '11111111111' },
      proveedorCuentaBancaria: { value: '0000 0000 0000 0000' },
    });
    // normalize descarta el override en oficiales (defensa en profundidad):
    expect(prefs.proveedorNIT?.value).toBeUndefined();
    expect(prefs.proveedorCodigo?.value).toBeUndefined();
    expect(prefs.proveedorCuentaBancaria?.value).toBeUndefined();
    // El modelo siempre dibuja el valor persistido:
    const model = buildSc212ModelData(sourceEnervida, prefs);
    expect(model.proveedorNIT).toBe(CONFIG_ENERVIDA.nit);
    expect(model.proveedorCuentaBancaria).toBe(CONFIG_ENERVIDA.bank_account);
  });

  it('los campos NO oficiales (dirección/teléfono/correo) admiten sustitución', () => {
    const prefs = normalizeSc212Prefs({
      proveedorTelefono: { value: '53000000' },
      proveedorEmail: { value: 'ventas@enervida.cu' },
    });
    const model = buildSc212ModelData(sourceEnervida, prefs);
    const pres = sc212PresentationOf(model);
    expect(pres.proveedorTelefono.value).toBe('53000000');
    expect(pres.proveedorEmail.value).toBe('ventas@enervida.cu');
    // Los oficiales NO se ven afectados:
    expect(model.proveedorNIT).toBe(CONFIG_ENERVIDA.nit);
  });

  it('restaurar (borrar la preferencia) devuelve el valor de la tienda', () => {
    const conPref = normalizeSc212Prefs({ proveedorTelefono: { value: '53000000' } });
    const modelCon = buildSc212ModelData(sourceEnervida, conPref);
    expect(sc212PresentationOf(modelCon).proveedorTelefono.value).toBe('53000000');
    const modelRestaurado = buildSc212ModelData(sourceEnervida, {});
    expect(sc212PresentationOf(modelRestaurado).proveedorTelefono.value).toBe('56561619');
  });

  it('preferencias corruptas o desconocidas se ignoran sin romper el documento', () => {
    const prefs = normalizeSc212Prefs({
      campoInexistente: { visible: false },
      proveedorNIT: 'no-es-un-objeto',
      proveedorDireccion: { label: '   ' }, // etiqueta vacía → default
    });
    expect(Object.keys(prefs)).not.toContain('campoInexistente');
    const model = buildSc212ModelData(sourceEnervida, prefs);
    const pres = sc212PresentationOf(model);
    expect(pres.proveedorDireccion.label).toBe(DEFAULT_SC212_FIELD_LABELS.proveedorDireccion);
    expect(pres.proveedorDireccion.value).toBe(CONFIG_ENERVIDA.address);
  });

  it('la key de preferencia es por tienda (aislamiento de personalización)', () => {
    expect(sc212PrefsKey('store-enervida')).toBe('sc212:fields:store-enervida');
    expect(sc212PrefsKey('store-puerto-padre')).toBe('sc212:fields:store-puerto-padre');
    expect(sc212PrefsKey('store-enervida')).not.toBe(sc212PrefsKey('store-puerto-padre'));
  });

  it('personalizar NO puede reescribir el modelo de otra tienda', () => {
    const prefsEnervida = normalizeSc212Prefs({ proveedorTelefono: { visible: false } });
    const modelEnervida = buildSc212ModelData(sourceEnervida, prefsEnervida);
    const sourceOtra: Sc212SourceData = {
      ...sourceEnervida,
      storeConfig: { ...CONFIG_ENERVIDA, phone: '24412345' },
    };
    const modelOtra = buildSc212ModelData(sourceOtra, {}); // sin prefs
    expect(sc212PresentationOf(modelEnervida).proveedorTelefono.visible).toBe(false);
    expect(sc212PresentationOf(modelOtra).proveedorTelefono.visible).toBe(true);
    expect(sc212PresentationOf(modelOtra).proveedorTelefono.value).toBe('24412345');
  });
});

describe('CP-SALES-024 · C — Leyenda sin nombres personales', () => {
  it('el modelo ignora el nombre del vendedor («David») aunque exista en la fuente', () => {
    const model = buildSc212ModelData(sourceEnervida);
    expect(model.entregaNombre).toBe('');
    expect(sourceEnervida.vendedorNombre).toBe('David'); // el dato existe…
  });

  it('el PDF renderizado contiene la leyenda genérica y NO contiene «— David»', async () => {
    const model = buildSc212ModelData(sourceEnervida);
    const text = decodePdf((await renderSc212Pdf(model)).output('arraybuffer'));
    // Pie de firma unificado (referencia de diseño 2026-11-09): los cargos se
    // dibujan centrados EN MAYÚSCULAS bajo la línea — la leyenda sigue siendo
    // la GENÉRICA constante (los paréntesis llegan escapados en el stream).
    expect(text).toContain('ENTREGA LOS PRODUCTOS');
    expect(text).toContain('NOMBRE Y FIRMA');
    expect(text).not.toContain('David');
    expect(text).not.toContain('— David');
  }, 30_000);
});

describe('CP-SALES-024 · D — Contenido del PDF renderizado', () => {
  it('el PDF lleva los datos de identificación de la tienda de la venta', async () => {
    const model = buildSc212ModelData(sourceEnervida);
    const text = decodePdf((await renderSc212Pdf(model)).output('arraybuffer'));
    expect(text).toContain('ENERVIDA-VITALLCONS');
    expect(text).toContain('Calle Menocal SN, Esquina a Francisco');
    expect(text).toContain('50004179942'); // REEUP y NIT (mismo valor persistido)
    expect(text).toContain('0664 4340 0002 6710'); // cuenta con espacios intactos
    expect(text).toContain('56561619');
    expect(text).toContain('vitallcons@gmail.com');
  }, 30_000);

  it('un campo oculto no aparece en el PDF (ni etiqueta ni valor)', async () => {
    const prefs = normalizeSc212Prefs({ proveedorEmail: { visible: false } });
    const model = buildSc212ModelData(sourceEnervida, prefs);
    const text = decodePdf((await renderSc212Pdf(model)).output('arraybuffer'));
    expect(text).not.toContain('vitallcons@gmail.com');
    // El resto sigue presente:
    expect(text).toContain('0664 4340 0002 6710');
    expect(text).toContain('ENERVIDA-VITALLCONS');
  }, 30_000);

  it('etiqueta personalizada aparece en el PDF con el valor oficial', async () => {
    const prefs = normalizeSc212Prefs({ proveedorNIT: { label: 'N.I.T. entidad' } });
    const model = buildSc212ModelData(sourceEnervida, prefs);
    const text = decodePdf((await renderSc212Pdf(model)).output('arraybuffer'));
    expect(text).toContain('N.I.T. entidad');
    expect(text).toContain('50004179942');
  }, 30_000);

  it('sin valores en la configuración, el PDF muestra la línea manual (no undefined)', async () => {
    const model = buildSc212ModelData({ ...sourceEnervida, storeConfig: null });
    const text = decodePdf((await renderSc212Pdf(model)).output('arraybuffer'));
    expect(text).toContain('ENERVIDA-VITALLCONS');
    expect(text).toContain('_______________'); // línea de cumplimentación manual
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  }, 30_000);
});
