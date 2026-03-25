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
  name: 'Estándar MVT v1.0 (Versat)',
  description: 'Plantilla base para exportación contable estructurada optimizada para Versat ERP',
  version: 1,
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
        { key: 'Descripcion', source: 'static', value: 'Entrada a almacen de produccion terminada' },
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
        { key: 'EMPTY_4_BIS', source: 'static', value: '' },
        { key: 'EXISTENCIA', source: 'dynamic', value: 'product.existencia' },
        { key: 'EMPTY_5', source: 'static', value: '' },
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
