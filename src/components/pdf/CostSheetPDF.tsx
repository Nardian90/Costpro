
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { CalculationResult } from '@/lib/cost-engine/types';
import { format } from 'date-fns';

// Register fonts if needed
// Font.register({ family: 'Helvetica', src: ... });

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 8,
    fontFamily: 'Helvetica',
    lineHeight: 1.2,
  },
  header: {
    flexDirection: 'row',
    marginBottom: 10,
    borderBottom: 1,
    borderBottomColor: '#CCC',
    paddingBottom: 5,
  },
  logo: {
    width: 50,
    height: 50,
    border: 1,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerTitleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ministryText: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  reportTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },
  subTitle: {
    fontSize: 8,
    textAlign: 'center',
    marginTop: 2,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 5,
    backgroundColor: '#F0F0F0',
    padding: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '33.33%',
    padding: 2,
  },
  label: {
    fontWeight: 'bold',
  },
  table: {
    width: 'auto',
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
    minHeight: 15,
    alignItems: 'center',
  },
  tableHeader: {
    backgroundColor: '#505050',
    color: '#FFF',
    fontWeight: 'bold',
  },
  tableCell: {
    padding: 3,
    flex: 1,
  },
  tableCellRight: {
    textAlign: 'right',
  },
  tableCellSmall: {
    width: 60,
    flex: 0,
  },
  tableCellLarge: {
    flex: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    borderTop: 1,
    borderTopColor: '#CCC',
    paddingTop: 5,
    fontSize: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
  }
});

interface CostSheetPDFProps {
  result: CalculationResult;
  exportOptions: {
    includeFC: boolean;
    includeAudit: boolean;
    includeAnnexes: string[];
    consolidated: boolean;
    skipZeros: boolean;
    includeFinancialSummary: boolean;
  };
}

export const CostSheetPDF: React.FC<CostSheetPDFProps> = ({ result, exportOptions }) => {
  const h = result.metadata?.header || {};
  const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

  const renderHeader = (title: string) => (
    <View style={styles.header}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>C</Text>
      </View>
      <View style={styles.headerTitleContainer}>
        <Text style={styles.ministryText}>MINISTERIO DE FINANZAS Y PRECIOS</Text>
        <Text style={styles.reportTitle}>FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS</Text>
        <Text style={styles.subTitle}>{title}</Text>
      </View>
    </View>
  );

  return (
    <Document>
      {exportOptions.includeFC && (
        <Page size="A4" style={styles.page}>
          {renderHeader("FICHA DE COSTO")}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DATOS GENERALES DE LA FICHA DE COSTO (FC)</Text>
            <View style={styles.grid}>
              <View style={styles.gridItem}><Text><Text style={styles.label}>No. FC:</Text> {h.code || result.fichaId || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>Cod. Producto:</Text> {h.product_code || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>Producto:</Text> {h.name || result.fichaName || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>UM:</Text> {h.unit || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>Cantidad:</Text> {h.quantity || 1}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>EMPRESA:</Text> {h.company || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>ORGANISMO:</Text> {h.organism || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>UNION:</Text> {h.union || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>Destino:</Text> {h.destination || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>Nivel de Producción:</Text> {h.production_level || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>% Capacidad:</Text> {h.capacity_utilization || 0}%</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>P. Venta:</Text> {h.sale_price?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) || '0.00'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>Cliente:</Text> {h.client || 'N/A'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>Moneda:</Text> {h.currency || 'CUP'}</Text></View>
              <View style={styles.gridItem}><Text><Text style={styles.label}>Fecha:</Text> {h.date || format(new Date(), "yyyy-MM-dd")}</Text></View>
            </View>
          </View>

          {exportOptions.includeFinancialSummary && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>RESUMEN FINANCIERO</Text>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Concepto</Text>
                  <Text style={[styles.tableCell, styles.tableCellRight]}>Valor</Text>
                </View>
                {[
                  ['Costo Total', result.summary.totalCost],
                  ['Utilidad', result.rows.find(r => r.classification === '13')?.total || 0],
                  ['% Utilidad / Costo', ((result.rows.find(r => r.classification === '13')?.total || 0) / (result.rows.find(r => r.classification === '12')?.total || 1) * 100).toFixed(2) + '%'],
                  ['Margen Comercial', result.summary.totalMargin],
                  ['Impuestos', result.summary.totalTax],
                  ['PRECIO FINAL', result.summary.grandTotal]
                ].map(([label, value], idx) => (
                  <View key={idx} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{label}</Text>
                    <Text style={[styles.tableCell, styles.tableCellRight]}>{typeof value === 'number' ? value.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : value}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DESGLOSE DE COSTOS</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, styles.tableCellSmall]}>Clasif.</Text>
                <Text style={[styles.tableCell, styles.tableCellLarge]}>Concepto</Text>
                <Text style={styles.tableCell}>Método</Text>
                <Text style={[styles.tableCell, styles.tableCellRight]}>V. Hist.</Text>
                <Text style={[styles.tableCell, styles.tableCellRight]}>Total</Text>
              </View>
              {result.rows
                .filter(r => {
                  const hasChildren = result.rows.some(child => child.classification.startsWith(r.classification + '.'));
                  if (!hasChildren && exportOptions.skipZeros && r.total === 0) return false;
                  return true;
                })
                .map((r, idx) => (
                  <View key={idx} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.tableCellSmall]}>{r.classification}</Text>
                    <Text style={[styles.tableCell, styles.tableCellLarge]}>{r.label.toUpperCase()}</Text>
                    <Text style={styles.tableCell}>{r.calculation_method}</Text>
                    <Text style={[styles.tableCell, styles.tableCellRight]}>{r.valor_historico?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) || '0.00'}</Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { fontWeight: 'bold' }]}>{r.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</Text>
                  </View>
                ))}
            </View>
          </View>

          <View style={styles.footer} fixed>
            <Text>Generado el: {timestamp}</Text>
            <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          </View>
        </Page>
      )}

      {result.anexos
        .filter(a => exportOptions.includeAnnexes.includes(a.id))
        .map((annex, aIdx) => {
          const totalImporte = annex.rows.reduce((sum, r) => sum + (r.importe || 0), 0);
          if (exportOptions.skipZeros && totalImporte === 0) return null;

          return (
            <Page key={annex.id} size="A4" style={styles.page}>
              {renderHeader(`ANEXO ${annex.id}`)}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{(annex.name || annex.id).toUpperCase()}</Text>
                <View style={styles.table}>
                   <View style={[styles.tableRow, styles.tableHeader]}>
                      {Object.keys(annex.rows[0] || {}).filter(k => k !== 'importe').map(h => (
                        <Text key={h} style={styles.tableCell}>{h.toUpperCase()}</Text>
                      ))}
                      <Text style={[styles.tableCell, styles.tableCellRight]}>IMPORTE</Text>
                   </View>
                   {annex.rows.map((row, rIdx) => (
                     <View key={rIdx} style={styles.tableRow}>
                        {Object.keys(row).filter(k => k !== 'importe').map(h => (
                          <Text key={h} style={styles.tableCell}>{String(row[h] || '')}</Text>
                        ))}
                        <Text style={[styles.tableCell, styles.tableCellRight]}>{(row.importe || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</Text>
                     </View>
                   ))}
                </View>
              </View>
              <View style={styles.footer} fixed>
                <Text>Generado el: {timestamp}</Text>
                <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
              </View>
            </Page>
          );
        })}

      {exportOptions.includeAudit && (
        <Page size="A4" style={styles.page}>
          {renderHeader("TRAZABILIDAD DE CÁLCULO (AUDITORÍA)")}
          <View style={styles.section}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={styles.tableCell}>Fila</Text>
                <Text style={styles.tableCell}>Tipo</Text>
                <Text style={[styles.tableCell, styles.tableCellLarge]}>Nota</Text>
                <Text style={styles.tableCell}>Cambio</Text>
              </View>
              {result.audits.map((a, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{a.rowId || '-'}</Text>
                  <Text style={styles.tableCell}>{a.type}</Text>
                  <Text style={[styles.tableCell, styles.tableCellLarge]}>{a.note}</Text>
                  <Text style={styles.tableCell}>{`${a.prev || '0'} -> ${a.now || '0'}`}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.footer} fixed>
            <Text>Generado el: {timestamp}</Text>
            <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
};
