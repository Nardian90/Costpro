
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { COLUMN_LABELS } from '@/contracts/reports';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#282828',
  },
  meta: {
    fontSize: 10,
    color: '#646464',
    marginBottom: 2,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: '#CCC',
    marginVertical: 10,
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
    backgroundColor: '#2980b9',
    color: '#ffffff',
    padding: 3,
    fontWeight: 'bold',
  },
  tableCol: {
    padding: 3,
    flex: 1,
  },
  tableCell: {
    fontSize: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    borderTopWidth: 1,
    borderTopColor: '#CCC',
    paddingTop: 5,
    fontSize: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  }
});

interface GenericReportPDFProps {
  name: string;
  type: string;
  from?: string;
  to?: string;
  timestamp: string;
  columns: string[];
  data: any[];
}

export const GenericReportPDF: React.FC<GenericReportPDFProps> = ({
  name,
  type,
  from,
  to,
  timestamp,
  columns,
  data
}) => {
  const displayHeaders = columns.map(h => (COLUMN_LABELS[h] || h).toUpperCase());

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{name || 'Reporte de Sistema'}</Text>
        <Text style={styles.meta}>Tipo: {type.toUpperCase()}</Text>
        <Text style={styles.meta}>Periodo: {from || 'N/A'} - {to || 'N/A'}</Text>
        <Text style={styles.meta}>Generado: {timestamp}</Text>

        <View style={styles.separator} />

        <View style={styles.table}>
          <View style={styles.tableRow}>
            {displayHeaders.map((header, idx) => (
              <View key={idx} style={[styles.tableColHeader, { flex: 1 }]}>
                <Text style={{ fontWeight: 'bold', color: '#FFF' }}>{header}</Text>
              </View>
            ))}
          </View>
          {data.map((row, rIdx) => (
            <View key={rIdx} style={styles.tableRow}>
              {columns.map((col, cIdx) => {
                const val = row[col];
                const displayVal = (typeof val === 'object' && val !== null) ? JSON.stringify(val) : (val?.toString() || '');
                return (
                  <View key={cIdx} style={styles.tableCol}>
                    <Text style={styles.tableCell}>{displayVal}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>Documento generado automáticamente por CostPro</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};
