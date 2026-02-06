
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatCurrency } from '@/lib/utils';

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
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  meta: {
    fontSize: 10,
    color: '#666',
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
    flex: 1,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    padding: 5,
    fontWeight: 'bold',
  },
  tableCol: {
    flex: 1,
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
  },
  footer: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  }
});

interface PivotStatementPDFProps {
  pivotData: any[];
  groupBy: 'day' | 'month' | 'year';
}

export const PivotStatementPDF: React.FC<PivotStatementPDFProps> = ({ pivotData, groupBy }) => {
  const totalCr = pivotData.reduce((s, g) => s + g.totalCr, 0);
  const totalDb = pivotData.reduce((s, g) => s + g.totalDb, 0);
  const netAmount = pivotData.reduce((s, g) => s + g.netAmount, 0);

  const groupLabel = groupBy === 'day' ? 'Fecha' : (groupBy === 'month' ? 'Mes' : 'Año');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>RESUMEN CONSOLIDADO DE CUENTA</Text>
          <Text style={styles.meta}>Generado el: {new Date().toLocaleString()}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>{groupLabel}</Text></View>
            <View style={[styles.tableColHeader, { flex: 0.5 }]}><Text style={styles.tableCellHeader}>Cant.</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Créditos (+)</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Débitos (-)</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Balance</Text></View>
          </View>

          {pivotData.map((g, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{g.label}</Text></View>
              <View style={[styles.tableCol, { flex: 0.5 }]}><Text style={styles.tableCell}>{g.count}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(g.totalCr)}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(g.totalDb)}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(g.netAmount)}</Text></View>
            </View>
          ))}

          <View style={[styles.tableRow, styles.footer]}>
            <View style={[styles.tableCol, { flex: 1.5 }]}><Text style={styles.tableCell}>TOTAL</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(totalCr)}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(totalDb)}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{formatCurrency(netAmount)}</Text></View>
          </View>
        </View>
      </Page>
    </Document>
  );
};
