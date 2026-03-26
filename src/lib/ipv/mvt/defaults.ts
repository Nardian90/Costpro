import { MVTTemplate, MVTSettings } from "./types";

export const DEFAULT_MVT_SETTINGS: MVTSettings = {
  id: 'current',
  lastExportNumber: 0,
  defaultTemplateId: 'standard-v1',
  globalUM: 'U',
  globalCuenta: '7000050',
  almacen: '0109',
  centro: '0110200012611',
  concepto: '210'
};

export const STANDARD_MVT_TEMPLATE: MVTTemplate = {
  id: 'standard-v1',
  name: 'Producción Terminada (Concepto 210)',
  description: 'Entrada al almacén de productos terminados. Extensión .mvt',
  version: 1,
  fileExtension: 'mvt',
  sections: [
    {
      title: '[Documento]',
      type: 'single',
      fields: [
        { key: 'Concepto', source: 'static', value: '210' },
        { key: 'Almacen', source: 'static', value: '0109' },
        { key: 'Numero', source: 'dynamic', value: 'global.numero' },
        { key: 'NumCtrl', source: 'template', value: '010({numero})' },
        { key: 'Fecha', source: 'dynamic', value: 'global.fecha' },
        { key: 'CuentaMN', source: 'static', value: '7000050' },
        { key: 'Descripcion', source: 'static', value: 'Entrada al almacen de productos terminados' },
        { key: 'Centro', source: 'static', value: '0110200012611' },
      ]
    },
    {
      title: '[Ubicacion]',
      type: 'repeatable',
      dataSource: 'products',
      fields: [
        { key: 'CODIGO', source: 'dynamic', value: 'product.cod' },
        { key: 'DESCRIPCION', source: 'dynamic', value: 'product.descripcion' },
        { key: 'UM', source: 'dynamic', value: 'product.um' },
        { key: 'CUENTA', source: 'dynamic', value: 'product.cuenta_contable' },
        { key: 'EMPTY_1', source: 'static', value: '' },
        { key: 'EMPTY_2', source: 'static', value: '' },
        { key: 'EMPTY_3', source: 'static', value: '' },
        { key: 'EMPTY_4', source: 'static', value: '' },
        { key: 'EMPTY_5', source: 'static', value: '01' },
      ]
    },
    {
      title: '[Movimientos]',
      type: 'repeatable',
      dataSource: 'movements',
      fields: [
        { key: 'CODIGO', source: 'dynamic', value: 'product.cod' },
        { key: 'UM', source: 'dynamic', value: 'product.um' },
        { key: 'CANTIDAD', source: 'dynamic', value: 'cantidad' },
        { key: 'COSTO', source: 'dynamic', value: 'costo' },
        { key: 'IMPORTE', source: 'expression', value: '{cantidad} * {costo}' },
        { key: '0_1', source: 'static', value: '0' },
        { key: '0_2', source: 'static', value: '0' },
        { key: 'EXISTENCIA', source: 'dynamic', value: 'product.existencia' },
      ]
    }
  ]
};

export const MVT_INVENTARIO_TEMPLATE: MVTTemplate = {
  id: 'mvt-inventario',
  name: 'Ajuste de Inventario (Concepto 2105)',
  description: 'Movimientos generales de inventario. Extensión .mvt',
  version: 1,
  fileExtension: 'mvt',
  sections: [
    {
      title: '[Documento]',
      type: 'single',
      fields: [
        { key: 'Concepto', source: 'static', value: '2105' },
        { key: 'Almacen', source: 'static', value: '0103' },
        { key: 'Numero', source: 'dynamic', value: 'global.numero' },
        { key: 'NumCtrl', source: 'template', value: '2-122' },
        { key: 'Fecha', source: 'dynamic', value: 'global.fecha' },
        { key: 'CuentaMN', source: 'static', value: '8650010' },
        { key: 'Descripcion', source: 'static', value: '48' },
        { key: 'Centro', source: 'static', value: '011860' },
      ]
    },
    {
      title: '[Ubicacion]',
      type: 'repeatable',
      dataSource: 'products',
      fields: [
        { key: 'CODIGO', source: 'dynamic', value: 'product.cod' },
        { key: 'DESCRIPCION', source: 'dynamic', value: 'product.descripcion' },
        { key: 'UM', source: 'dynamic', value: 'product.um' },
        { key: 'CUENTA', source: 'dynamic', value: 'product.cuenta_contable' },
        { key: 'EMPTY_1', source: 'static', value: '' },
        { key: 'EMPTY_2', source: 'static', value: '' },
        { key: 'EMPTY_3', source: 'static', value: '' },
        { key: 'EMPTY_4', source: 'static', value: '' },
        { key: 'EMPTY_5', source: 'static', value: '0' },
        { key: 'EMPTY_6', source: 'static', value: '' },
      ]
    },
    {
      title: '[Movimientos]',
      type: 'repeatable',
      dataSource: 'movements',
      fields: [
        { key: 'CODIGO', source: 'dynamic', value: 'product.cod' },
        { key: 'UM', source: 'dynamic', value: 'product.um' },
        { key: 'CANTIDAD', source: 'dynamic', value: 'cantidad' },
        { key: 'COSTO', source: 'dynamic', value: 'costo' },
        { key: 'IMPORTE', source: 'expression', value: '{cantidad} * {costo}' },
        { key: '0_1', source: 'static', value: '0' },
        { key: '0_2', source: 'static', value: '0' },
        { key: 'EXISTENCIA', source: 'dynamic', value: 'product.existencia' },
        { key: 'AUX_1', source: 'static', value: '11110' },
        { key: 'AUX_2', source: 'static', value: '' },
      ]
    }
  ]
};

export const MVT_RECEPCION_TEMPLATE: MVTTemplate = {
  id: 'mvt-recepcion',
  name: 'Recepción Proveedor (Concepto 2100)',
  description: 'Recepción de productos desde proveedor. Extensión .mvt',
  version: 1,
  fileExtension: 'mvt',
  sections: [
    {
      title: '[Documento]',
      type: 'single',
      fields: [
        { key: 'Concepto', source: 'static', value: '2100' },
        { key: 'Almacen', source: 'static', value: '0109' },
        { key: 'Numero', source: 'dynamic', value: 'global.numero' },
        { key: 'NumCtrl', source: 'template', value: '001801092026' },
        { key: 'Fecha', source: 'dynamic', value: 'global.fecha' },
        { key: 'CuentaMN', source: 'static', value: '8100020' },
        { key: 'Descripcion', source: 'static', value: '' },
        { key: 'Entidad', source: 'template', value: '002060686|SOCIEDAD MERCANTIL FERRETERIA UNIVERSALES S.A|60686||Prolongación 48 c/41 y Río Almendares, Playa||42257419|30001718399||Habana|Cuba|' },
      ]
    },
    {
      title: '[Ubicacion]',
      type: 'repeatable',
      dataSource: 'products',
      fields: [
        { key: 'CODIGO', source: 'dynamic', value: 'product.cod' },
        { key: 'DESCRIPCION', source: 'dynamic', value: 'product.descripcion' },
        { key: 'UM', source: 'dynamic', value: 'product.um' },
        { key: 'CUENTA', source: 'dynamic', value: '6991   188 1    0109' },
        { key: 'EMPTY_1', source: 'static', value: '' },
        { key: 'EMPTY_2', source: 'static', value: '' },
        { key: 'EMPTY_3', source: 'static', value: '' },
        { key: 'EMPTY_4', source: 'static', value: '' },
        { key: 'EMPTY_5', source: 'static', value: '0' },
      ]
    },
    {
      title: '[Movimientos]',
      type: 'repeatable',
      dataSource: 'movements',
      fields: [
        { key: 'CODIGO', source: 'dynamic', value: 'product.cod' },
        { key: 'UM', source: 'dynamic', value: 'product.um' },
        { key: 'CANTIDAD', source: 'dynamic', value: 'cantidad' },
        { key: 'COSTO', source: 'dynamic', value: 'costo' },
        { key: 'IMPORTE', source: 'expression', value: '{cantidad} * {costo}' },
        { key: '0_1', source: 'static', value: '0' },
        { key: '0_2', source: 'static', value: '0' },
        { key: 'EXISTENCIA', source: 'dynamic', value: 'product.existencia' },
      ]
    }
  ]
};

export const MVT_RECEPCION_ALT_TEMPLATE: MVTTemplate = {
  id: 'mvt-recepcion-alt',
  name: 'Recepción Alternativa (Concepto 202)',
  description: 'Recepción con detalles de factura y moneda. Extensión .mvt',
  version: 1,
  fileExtension: 'mvt',
  sections: [
    {
      title: '[Documento]',
      type: 'single',
      fields: [
        { key: 'Concepto', source: 'static', value: '202' },
        { key: 'Almacen', source: 'static', value: '0103' },
        { key: 'Numero', source: 'dynamic', value: 'global.numero' },
        { key: 'NumCtrl', source: 'static', value: '' },
        { key: 'Fecha', source: 'dynamic', value: 'global.fecha' },
        { key: 'CuentaMN', source: 'static', value: '6992   1' },
        { key: 'Descripcion', source: 'static', value: '' },
        { key: 'Entidad', source: 'static', value: '00205691|EMPRESA ACOPIO LAS TUNAS, UEB COMERCIALIZADORA|744005691||Roberto Reyes No. 29 % Melanio Ortiz y Pablo Escobar|||011001007154||Las Tunas|Cuba|' },
        { key: 'Factura', source: 'static', value: '0-110' },
        { key: 'Moneda', source: 'static', value: 'PESO CUBANO' },
        { key: 'Recargo', source: 'static', value: '0' },
        { key: 'Descuento', source: 'static', value: '0' },
        { key: 'Servicios', source: 'static', value: '0' },
      ]
    },
    {
      title: '[Ubicacion]',
      type: 'repeatable',
      dataSource: 'products',
      fields: [
        { key: 'CODIGO', source: 'dynamic', value: 'product.cod' },
        { key: 'DESCRIPCION', source: 'dynamic', value: 'product.descripcion' },
        { key: 'UM', source: 'dynamic', value: 'product.um' },
        { key: 'CUENTA', source: 'dynamic', value: '19300100103' },
        { key: 'EMPTY_1', source: 'static', value: '' },
        { key: 'EMPTY_2', source: 'static', value: '' },
        { key: 'EMPTY_3', source: 'static', value: '' },
        { key: 'EMPTY_4', source: 'static', value: '' },
        { key: 'EMPTY_5', source: 'static', value: '0' },
      ]
    },
    {
      title: '[Movimientos]',
      type: 'repeatable',
      dataSource: 'movements',
      fields: [
        { key: 'CODIGO', source: 'dynamic', value: 'product.cod' },
        { key: 'UM', source: 'dynamic', value: 'product.um' },
        { key: 'CANTIDAD', source: 'dynamic', value: 'cantidad' },
        { key: 'COSTO_1', source: 'dynamic', value: 'costo' },
        { key: 'COSTO_2', source: 'expression', value: '{importe_cents} / {cantidad} / 100' },
        { key: '0_1', source: 'static', value: '0' },
        { key: '0_2', source: 'static', value: '0' },
        { key: 'EXISTENCIA', source: 'dynamic', value: 'product.existencia' },
        { key: '0_3', source: 'static', value: '0' },
        { key: '0_4', source: 'static', value: '0' },
        { key: '0_5', source: 'static', value: '0' },
        { key: '0_6', source: 'static', value: '0' },
        { key: 'COSTO_3', source: 'expression', value: '{importe_cents} / {cantidad} / 100' },
        { key: '0_7', source: 'static', value: '0' },
      ]
    }
  ]
};

export const CYP_COMEDOR_TEMPLATE: MVTTemplate = {
  id: 'cyp-comedor',
  name: 'Ingresos Comedor (.cyp)',
  description: 'Plantilla para ingresos de comedor y cafetería. Extensión .cyp',
  version: 1,
  fileExtension: 'cyp',
  sections: [
    {
      title: 'Header',
      type: 'single',
      hideTitle: true,
      fields: [
        { key: 'Tipo', source: 'template', value: 'Tipo={7C18E812-CFD1-4358-8011-BDDF2783510D}' },
        { key: 'Unidad', source: 'template', value: 'Unidad=01' },
        { key: 'Numero', source: 'template', value: 'Numero={numero}' },
        { key: 'Fechaemi', source: 'template', value: 'Fechaemi={fecha}' },
        { key: 'Descripcion', source: 'template', value: 'Descripcion=INGRESOS DE COMEDOR Y CAFETERIA' },
        { key: 'Deposito', source: 'template', value: 'Deposito=10140' },
        { key: 'Talonario', source: 'template', value: 'Talonario=1' },
        { key: 'Importe', source: 'template', value: 'Importe={importe}' },
        { key: 'EntregadoA', source: 'template', value: 'EntregadoA={entregado_a}' },
      ]
    },
    {
      title: '[Contrapartidas]',
      type: 'single',
      fields: [
        { key: 'Concepto', source: 'static', value: '22' },
        { key: 'Importe', source: 'dynamic', value: 'global.importe' },
      ],
      footer: '{ \n9500010|CUP|{importe} \n}'
    }
  ]
};

export const CYP_DEPOSITO_TEMPLATE: MVTTemplate = {
  id: 'cyp-deposito',
  name: 'Depósito Efectivo (.cyp)',
  description: 'Plantilla para depósitos de efectivo. Extensión .cyp',
  version: 1,
  fileExtension: 'cyp',
  sections: [
    {
      title: 'Header',
      type: 'single',
      hideTitle: true,
      fields: [
        { key: 'Tipo', source: 'template', value: 'Tipo={69A469FB-6AB8-4C90-A126-1BCF1E785889}' },
        { key: 'Unidad', source: 'template', value: 'Unidad=01' },
        { key: 'Numero', source: 'template', value: 'Numero={numero}' },
        { key: 'Fechaemi', source: 'template', value: 'Fechaemi={fecha}' },
        { key: 'Descripcion', source: 'template', value: 'Descripcion=DEPÓSITO DE EFECTIVO' },
        { key: 'Deposito', source: 'template', value: 'Deposito={deposito}' },
        { key: 'Importe', source: 'template', value: 'Importe={importe}' },
        { key: 'EntregadoA', source: 'template', value: 'EntregadoA={entregado_a}' },
      ]
    },
    {
      title: '[Contrapartidas]',
      type: 'single',
      fields: [
        { key: 'Concepto', source: 'static', value: '24' },
        { key: 'Importe', source: 'dynamic', value: 'global.importe' },
      ],
      footer: '{ \n41 \n42 \n43 \n44 \n}'
    }
  ]
};
