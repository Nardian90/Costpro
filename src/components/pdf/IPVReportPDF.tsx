
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { DailyIPVReport } from '@/lib/dexie';
import { formatCurrency } from '@/lib/utils';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: 'Helvetica',
  },
  branding: {
    fontSize: 8,
    color: '#999',
    marginBottom: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  meta: {
    fontSize: 10,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 5,
  },
  table: {
    width: 'auto',
    marginTop: 5,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#bfbfbf',
    minHeight: 15,
    alignItems: 'center',
  },
  tableColHeader: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    padding: 3,
    fontWeight: 'bold',
  },
  tableCol: {
    padding: 3,
  },
  tableCell: {
    fontSize: 8,
  },
  tableCellRight: {
    textAlign: 'right',
  },
  signature: {
    marginTop: 30,
    borderTopWidth: 1,
    borderTopColor: '#000',
    width: 150,
    paddingTop: 5,
  }
});

interface IPVReportPDFProps {
  reports: DailyIPVReport[];
  consolidated?: boolean;
  consolidatedMeta?: {
      title: string;
      totalVentas: number;
      totalEfectivo: number;
      totalTransferencia: number;
      daysCount: number;
      productSummary: any[];
  };
}

export const IPVReportPDF: React.FC<IPVReportPDFProps> = ({ reports, consolidated, consolidatedMeta }) => {
  if (consolidated && consolidatedMeta) {
      return (
          <Document>
              <Page size="A4" style={styles.page}>
                  <Text style={styles.branding}>CostPro</Text>
                  <Text style={styles.title}>{consolidatedMeta.title}</Text>

                  <View style={styles.table}>
                      <View style={styles.tableRow}>
                          <View style={[styles.tableColHeader, { flex: 1 }]}><Text>Concepto</Text></View>
                          <View style={[styles.tableColHeader, { flex: 1 }]}><Text>Total Mensual</Text></View>
                      </View>
                      <View style={styles.tableRow}>
                          <View style={[styles.tableCol, { flex: 1 }]}><Text>Total Ventas Brutas</Text></View>
                          <View style={[styles.tableCol, { flex: 1 }]}><Text>{formatCurrency(consolidatedMeta.totalVentas)}</Text></View>
                      </View>
                      <View style={styles.tableRow}>
                          <View style={[styles.tableCol, { flex: 1 }]}><Text>Total Efectivo</Text></View>
                          <View style={[styles.tableCol, { flex: 1 }]}><Text>{formatCurrency(consolidatedMeta.totalEfectivo)}</Text></View>
                      </View>
                      <View style={styles.tableRow}>
                          <View style={[styles.tableCol, { flex: 1 }]}><Text>Total Transferencias</Text></View>
                          <View style={[styles.tableCol, { flex: 1 }]}><Text>{formatCurrency(consolidatedMeta.totalTransferencia)}</Text></View>
                      </View>
                      <View style={styles.tableRow}>
                          <View style={[styles.tableCol, { flex: 1 }]}><Text>Días Reportados</Text></View>
                          <View style={[styles.tableCol, { flex: 1 }]}><Text>{consolidatedMeta.daysCount}</Text></View>
                      </View>
                  </View>

                  <Text style={styles.sectionTitle}>CONSOLIDADO POR PRODUCTO</Text>
                  <View style={styles.table}>
                      <View style={styles.tableRow}>
                          <View style={[styles.tableColHeader, { width: 40 }]}><Text>Cod</Text></View>
                          <View style={[styles.tableColHeader, { flex: 1 }]}><Text>Producto</Text></View>
                          <View style={[styles.tableColHeader, { width: 30 }]}><Text>UM</Text></View>
                          <View style={[styles.tableColHeader, { width: 40 }]}><Text>Ini Mes</Text></View>
                          <View style={[styles.tableColHeader, { width: 40 }]}><Text>Venta Mes</Text></View>
                          <View style={[styles.tableColHeader, { width: 50 }]}><Text>Precio</Text></View>
                          <View style={[styles.tableColHeader, { width: 60 }]}><Text>Imp Mes</Text></View>
                          <View style={[styles.tableColHeader, { width: 40 }]}><Text>Fin Mes</Text></View>
                      </View>
                      {consolidatedMeta.productSummary.map((f, idx) => (
                          <View key={idx} style={styles.tableRow}>
                              <View style={[styles.tableCol, { width: 40 }]}><Text>{f.cod}</Text></View>
                              <View style={[styles.tableCol, { flex: 1 }]}><Text>{f.descripcion}</Text></View>
                              <View style={[styles.tableCol, { width: 30 }]}><Text>{f.um}</Text></View>
                              <View style={[styles.tableCol, { width: 40, textAlign: 'center' }]}><Text>{f.saldo_inicial_qty}</Text></View>
                              <View style={[styles.tableCol, { width: 40, textAlign: 'center' }]}><Text>{f.venta_cantidad_qty}</Text></View>
                              <View style={[styles.tableCol, { width: 50, textAlign: 'right' }]}><Text>{formatCurrency(f.precio_unitario_cents)}</Text></View>
                              <View style={[styles.tableCol, { width: 60, textAlign: 'right' }]}><Text>{formatCurrency(f.importe_cents)}</Text></View>
                              <View style={[styles.tableCol, { width: 40, textAlign: 'center' }]}><Text>{f.existencia_final_qty}</Text></View>
                          </View>
                      ))}
                  </View>
              </Page>
          </Document>
      );
  }

  return (
    <Document>
      {reports.map((report, rIdx) => (
        <Page key={rIdx} size="A4" style={styles.page}>
          <Text style={styles.branding}>CostPro</Text>
          <Text style={styles.title}>REPORTE IPV DIARIO</Text>

          <Text style={styles.meta}>Fecha del Reporte: {report.fecha_reporte}</Text>
          <Text style={styles.meta}>Estado: {report.estado}</Text>
          <Text style={styles.meta}>Fecha de Confección: {report.fecha_reporte}</Text>

          <Text style={styles.sectionTitle}>RESUMEN MONETARIO</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
                <View style={[styles.tableColHeader, { flex: 1 }]}><Text>Concepto</Text></View>
                <View style={[styles.tableColHeader, { flex: 1 }]}><Text>Monto</Text></View>
            </View>
            <View style={styles.tableRow}>
                <View style={[styles.tableCol, { flex: 1 }]}><Text>Total Ventas</Text></View>
                <View style={[styles.tableCol, { flex: 1 }]}><Text>{formatCurrency(report.total_ventas_cents)}</Text></View>
            </View>
            <View style={styles.tableRow}>
                <View style={[styles.tableCol, { flex: 1 }]}><Text>Resumen Efectivo</Text></View>
                <View style={[styles.tableCol, { flex: 1 }]}><Text>{formatCurrency(report.resumen_efectivo_cents)}</Text></View>
            </View>
            <View style={styles.tableRow}>
                <View style={[styles.tableCol, { flex: 1 }]}><Text>Resumen Transferencia</Text></View>
                <View style={[styles.tableCol, { flex: 1 }]}><Text>{formatCurrency(report.resumen_transferencia_cents)}</Text></View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>DETALLE DE PRODUCTOS</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
                <View style={[styles.tableColHeader, { width: 30 }]}><Text>Cod</Text></View>
                <View style={[styles.tableColHeader, { flex: 1 }]}><Text>Producto</Text></View>
                <View style={[styles.tableColHeader, { width: 20 }]}><Text>UM</Text></View>
                <View style={[styles.tableColHeader, { width: 35 }]}><Text>Inicial</Text></View>
                <View style={[styles.tableColHeader, { width: 35 }]}><Text>E/S</Text></View>
                <View style={[styles.tableColHeader, { width: 35 }]}><Text>Venta</Text></View>
                <View style={[styles.tableColHeader, { width: 45 }]}><Text>Precio</Text></View>
                <View style={[styles.tableColHeader, { width: 55 }]}><Text>Importe</Text></View>
                <View style={[styles.tableColHeader, { width: 35 }]}><Text>Final</Text></View>
            </View>
            {report.filas.map((f: any, idx) => (
              <View key={idx} style={styles.tableRow}>
                <View style={[styles.tableCol, { width: 30 }]}><Text>{f.cod}</Text></View>
                <View style={[styles.tableCol, { flex: 1 }]}><Text>{f.descripcion}</Text></View>
                <View style={[styles.tableCol, { width: 20 }]}><Text>{f.um}</Text></View>
                <View style={[styles.tableCol, { width: 35, textAlign: 'center' }]}><Text>{f.saldo_inicial_qty}</Text></View>
                <View style={[styles.tableCol, { width: 35, textAlign: 'center' }]}><Text>{f.entrada_salida_qty}</Text></View>
                <View style={[styles.tableCol, { width: 35, textAlign: 'center' }]}><Text>{f.venta_cantidad_qty}</Text></View>
                <View style={[styles.tableCol, { width: 45, textAlign: 'right' }]}><Text>{formatCurrency(f.precio_unitario_cents)}</Text></View>
                <View style={[styles.tableCol, { width: 55, textAlign: 'right' }]}><Text>{formatCurrency(f.importe_cents)}</Text></View>
                <View style={[styles.tableCol, { width: 35, textAlign: 'center' }]}><Text>{f.existencia_final_qty}</Text></View>
              </View>
            ))}
          </View>

          <View style={styles.signature}>
            <Text>Firma Responsable</Text>
            <Text>Realizado por: {report.firmas?.realizado_por || ''}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
};
