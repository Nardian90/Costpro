import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer
} from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  section: {
    margin: 10,
    padding: 10,
  },
  title: {
    fontSize: 12,
    marginBottom: 10,
    fontWeight: 'bold',
    backgroundColor: '#f0f0f0',
    padding: 5,
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    marginTop: 10,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableColHeader: {
    width: '11%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: '#16a34a',
    color: 'white',
    padding: 5,
  },
  tableCol: {
    width: '11%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
  },
  tableCell: {
    fontSize: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  footer: {
    marginTop: 50,
    borderTopWidth: 1,
    paddingTop: 10,
  }
});

const IPVDocument = ({ report }: { report: any }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.header}>REPORTE IPV DIARIO (SERVER GEN)</Text>

      <View style={{ marginBottom: 20 }}>
        <Text>Fecha del Reporte: {report.fecha_reporte}</Text>
        <Text>Estado: {report.estado}</Text>
        <Text>Generado el: {new Date().toLocaleString()}</Text>
      </View>

      <View>
        <Text style={styles.title}>RESUMEN MONETARIO</Text>
        <View style={styles.summaryRow}>
          <Text>Total Ventas:</Text>
          <Text>$ {(report.total_ventas_cents / 100).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text>Resumen Efectivo:</Text>
          <Text>$ {(report.resumen_efectivo_cents / 100).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text>Resumen Transferencia:</Text>
          <Text>$ {(report.resumen_transferencia_cents / 100).toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableRow}>
          <View style={styles.tableColHeader}><Text style={styles.tableCell}>Cod</Text></View>
          <View style={[styles.tableColHeader, { width: '23%' }]}><Text style={styles.tableCell}>Producto</Text></View>
          <View style={styles.tableColHeader}><Text style={styles.tableCell}>UM</Text></View>
          <View style={styles.tableColHeader}><Text style={styles.tableCell}>Ini</Text></View>
          <View style={styles.tableColHeader}><Text style={styles.tableCell}>E/S</Text></View>
          <View style={styles.tableColHeader}><Text style={styles.tableCell}>Venta</Text></View>
          <View style={styles.tableColHeader}><Text style={styles.tableCell}>Precio</Text></View>
          <View style={styles.tableColHeader}><Text style={styles.tableCell}>Importe</Text></View>
        </View>
        {report.filas.map((f: any, i: number) => (
          <View style={styles.tableRow} key={i}>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{f.cod}</Text></View>
            <View style={[styles.tableCol, { width: '23%' }]}><Text style={styles.tableCell}>{f.descripcion}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{f.um}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{f.saldo_inicial_qty}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{f.entrada_salida_qty}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>{f.venta_cantidad_qty}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>$ {(f.precio_unitario_cents / 100).toFixed(2)}</Text></View>
            <View style={styles.tableCol}><Text style={styles.tableCell}>$ {(f.importe_cents / 100).toFixed(2)}</Text></View>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text>Firma Responsable: __________________________</Text>
        <Text style={{ marginTop: 10 }}>Realizado por: {report.firmas?.realizado_por || 'Sistema'}</Text>
      </View>
    </Page>
  </Document>
);

export async function POST(req: NextRequest) {
  try {
    const report = await req.json();

    const buffer = await renderToBuffer(<IPVDocument report={report} />);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=IPV_${report.fecha_reporte}.pdf`,
      },
    });
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
