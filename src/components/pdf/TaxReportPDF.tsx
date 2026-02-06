
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  meta: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  table: {
    width: 'auto',
    marginTop: 10,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableColHeader: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    backgroundColor: '#10b981',
    color: '#ffffff',
    padding: 5,
    fontWeight: 'bold',
  },
  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    padding: 5,
  },
  tableCellHeader: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  tableCell: {
    fontSize: 10,
  }
});

interface TaxReportPDFProps {
  selectedTransactions: Transaction[];
  activeTaxes: any[];
  totalSales: number;
  calculateTax: (base: number, tax: any) => number;
  user: any;
  exportMode: 'combined' | 'separate';
  includeAnnex: boolean;
}

export const TaxReportPDF: React.FC<TaxReportPDFProps> = ({
  selectedTransactions,
  activeTaxes,
  totalSales,
  calculateTax,
  user,
  exportMode,
  includeAnnex
}) => {
  const totalWithTaxes = totalSales + activeTaxes.reduce((acc, t) => acc + calculateTax(totalSales, t), 0);

  const renderSummaryPage = () => (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Reporte de Cálculo de Impuestos</Text>
        <Text style={styles.meta}>Fecha de generación: {new Date().toLocaleString()}</Text>
        <Text style={styles.meta}>Usuario: {user?.fullName || 'Admin'}</Text>
        <Text style={styles.meta}>Facturas seleccionadas: {selectedTransactions.length}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Concepto</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Base de Cálculo</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Cálculo</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Total</Text></View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.tableCol}><Text style={styles.tableCell}>Ventas Totales (Base)</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(totalSales)}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>-</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(totalSales)}</Text></View>
          </View>
          {activeTaxes.map((tax, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{tax.name}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(totalSales)}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{tax.type === 'percentage' ? `${tax.value}%` : 'Fijo'}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(calculateTax(totalSales, tax))}</Text></View>
            </View>
          ))}
          <View style={styles.tableRow}>
            <View style={[styles.tableCol, { width: '75%', alignItems: 'flex-end' }]}><Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Total con Impuestos</Text></View>
            <View style={styles.tableCol}><Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{formatCurrency(totalWithTaxes)}</Text></View>
          </View>
        </View>
      </View>

      {exportMode === 'combined' && includeAnnex && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Anexo: Detalle de Facturas</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <View style={[styles.tableColHeader, { backgroundColor: '#64748b' }]}><Text style={styles.tableCellHeader}>Referencia</Text></View>
              <View style={[styles.tableColHeader, { backgroundColor: '#64748b' }]}><Text style={styles.tableCellHeader}>Fecha</Text></View>
              <View style={[styles.tableColHeader, { backgroundColor: '#64748b', width: '50%' }]}><Text style={styles.tableCellHeader}>Monto</Text></View>
            </View>
            {selectedTransactions.map((t, idx) => (
              <View key={idx} style={styles.tableRow}>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{t.id.split('-')[0].toUpperCase()}</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{formatDate(t.created_at)}</Text></View>
                <View style={[styles.tableCol, { width: '50%' }]}><Text style={styles.tableCell}>{formatCurrency(t.total_amount)}</Text></View>
              </View>
            ))}
          </View>
        </View>
      )}
    </Page>
  );

  return (
    <Document>
      {renderSummaryPage()}
      {exportMode === 'separate' && activeTaxes.map((tax, idx) => (
        <React.Fragment key={idx}>
          <Page size="A4" style={styles.page}>
            <View style={styles.header}>
              <Text style={styles.title}>Detalle de Impuesto: {tax.name}</Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <View style={[styles.tableColHeader, { backgroundColor: '#3b82f6' }]}><Text style={styles.tableCellHeader}>Concepto</Text></View>
                <View style={[styles.tableColHeader, { backgroundColor: '#3b82f6' }]}><Text style={styles.tableCellHeader}>Base</Text></View>
                <View style={[styles.tableColHeader, { backgroundColor: '#3b82f6' }]}><Text style={styles.tableCellHeader}>Tasa</Text></View>
                <View style={[styles.tableColHeader, { backgroundColor: '#3b82f6' }]}><Text style={styles.tableCellHeader}>Total</Text></View>
              </View>
              <View style={styles.tableRow}>
                <View style={styles.tableCol}><Text style={styles.tableCell}>Base Imponible</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(totalSales)}</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>-</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(totalSales)}</Text></View>
              </View>
              <View style={styles.tableRow}>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{tax.name}</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(totalSales)}</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{tax.type === 'percentage' ? `${tax.value}%` : 'Fijo'}</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(calculateTax(totalSales, tax))}</Text></View>
              </View>
            </View>

            {includeAnnex && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Anexo de Facturas</Text>
                <View style={styles.table}>
                  <View style={styles.tableRow}>
                    <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Referencia</Text></View>
                    <View style={[styles.tableColHeader, { width: '75%' }]}><Text style={styles.tableCellHeader}>Monto</Text></View>
                  </View>
                  {selectedTransactions.map((t, tIdx) => (
                    <View key={tIdx} style={styles.tableRow}>
                      <View style={styles.tableCol}><Text style={styles.tableCell}>{t.id.split('-')[0].toUpperCase()}</Text></View>
                      <View style={[styles.tableCol, { width: '75%' }]}><Text style={styles.tableCell}>{formatCurrency(t.total_amount)}</Text></View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Page>
        </React.Fragment>
      ))}
    </Document>
  );
};
