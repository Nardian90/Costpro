import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * MISIÓN SERVICIOS RECIBIDOS (2026-10-23) — contrato estático de autenticación
 * de los modales de pago a proveedor.
 *
 * Causa raíz del «Error al registrar el pago» (SRV-20261022-00085): los fetch
 * de la pestaña Pagos NO llevaban Authorization Bearer y el backend
 * (getServerSession, SEC-024 fail-closed) SOLO autentica por Bearer → 401
 * «No autorizado» degradado a un error genérico por el frontend. El historial
 * (GET) tampoco la llevaba → «Sin pagos» perpetuo, y en recepciones faltaba
 * además el store_id obligatorio (FIX-AUD5-H1).
 *
 * Los modales son componentes internos (no exportados) de sus vistas — el
 * contrato estático es la barrera de regresión (mismo patrón que
 * v2-18-0-servicios-arqueo-contract.test.ts).
 */
function src(rel: string): string {
  try {
    return readFileSync(resolve(__dirname, rel), 'utf8');
  } catch {
    return '';
  }
}

const RSV = src('../../components/views/terminal/views/received_services/ReceivedServicesView.tsx');
const RDM = src('../../components/views/terminal/views/receptions/ReceptionDetailsModal.tsx');

describe.skipIf(!RSV || !RDM)('Modales de pago a proveedor — contrato de autenticación', () => {
  describe('ReceivedServicesView.ServiceDetailModal (servicios)', () => {
    it('el GET del historial envía Authorization', () => {
      expect(RSV).toContain(
        'fetch(`/api/payments?ref_type=service&ref_id=${service.id}&store_id=${storeId}`, {'
      );
      expect(RSV).toMatch(/Authorization: `Bearer \$\{authToken\}`/);
    });

    it('el POST del pago usa authHeaders (Content-Type + Bearer)', () => {
      const postBlock = RSV.slice(
        RSV.indexOf("await fetch('/api/payments', {"),
        RSV.indexOf("await fetch('/api/payments', {") + 900
      );
      expect(postBlock).toContain('headers: authHeaders');
    });

    it('el POST envía payment_date (formatOperationDateForRPC) + idempotencia', () => {
      expect(RSV).toContain('payment_date: formatOperationDateForRPC(paymentDate)');
      expect(RSV).toContain('idempotency_key: crypto.randomUUID()');
    });

    it('la fecha del pago se valida antes de enviar (nunca futura) y bloquea el botón', () => {
      expect(RSV).toContain('const paymentDateValidation = useOperationDateValidation(');
      expect(RSV).toContain('if (!paymentDateValidation.valid)');
      expect(RSV).toContain('disabled={submitting || !paymentDateValidation.valid}');
    });

    it('OperationDatePicker presente con tope HOY', () => {
      expect(RSV).toContain('const maxPaymentDate = todayBusinessDay()');
      expect(RSV).toMatch(/<OperationDatePicker[^>]*label="Fecha del pago"/);
    });

    it('el DELETE del historial envía Authorization', () => {
      const delBlock = RSV.slice(
        RSV.indexOf('fetch(`/api/payments/${p.id}`, {'),
        RSV.indexOf('fetch(`/api/payments/${p.id}`, {') + 400
      );
      expect(delBlock).toMatch(/Authorization: `Bearer \$\{authToken\}`/);
    });

    it('handleRecalculate (distribute, withAuth) usa authHeaders', () => {
      const block = RSV.slice(
        RSV.indexOf("fetch('/api/received-services/distribute', {"),
        RSV.indexOf("fetch('/api/received-services/distribute', {") + 300
      );
      expect(block).toContain('headers: authHeaders');
    });
  });

  describe('ReceptionDetailsModal (recepciones)', () => {
    it('el GET del historial envía Authorization + store_id obligatorio', () => {
      expect(RDM).toContain(
        'fetch(`/api/payments?ref_type=receipt&ref_id=${receiptId}&store_id=${storeId}`, {'
      );
      expect(RDM).toMatch(/Authorization: `Bearer \$\{authToken\}`/);
    });

    it('el POST del pago usa authHeaders y envía payment_date + idempotencia', () => {
      const postBlock = RDM.slice(
        RDM.indexOf("await fetch('/api/payments', {"),
        RDM.indexOf("await fetch('/api/payments', {") + 900
      );
      expect(postBlock).toContain('headers: authHeaders');
      expect(RDM).toContain('payment_date: formatOperationDateForRPC(paymentDate)');
      expect(RDM).toContain('idempotency_key: crypto.randomUUID()');
    });

    it('la fecha del pago se valida antes de enviar y bloquea el botón', () => {
      expect(RDM).toContain('const paymentDateValidation = useOperationDateValidation(');
      expect(RDM).toContain('if (!paymentDateValidation.valid)');
      expect(RDM).toContain('disabled={submitting || !paymentDateValidation.valid}');
    });

    it('OperationDatePicker presente con tope HOY', () => {
      expect(RDM).toContain('const maxPaymentDate = todayBusinessDay()');
      expect(RDM).toMatch(/<OperationDatePicker[^>]*label="Fecha del pago"/);
    });

    it('el DELETE del historial envía Authorization', () => {
      const delBlock = RDM.slice(
        RDM.indexOf('fetch(`/api/payments/${p.id}`, {'),
        RDM.indexOf('fetch(`/api/payments/${p.id}`, {') + 400
      );
      expect(delBlock).toMatch(/Authorization: `Bearer \$\{authToken\}`/);
    });

    it('creación rápida y recálculo de servicios desde la recepción usan Bearer', () => {
      expect(RDM).toContain("useAuthStore.getState().token");
      // dos usos: handleQuickCreate + handleRecalculate + DELETE (≥3)
      const uses = RDM.match(/useAuthStore\.getState\(\)\.token/g) || [];
      expect(uses.length).toBeGreaterThanOrEqual(3);
    });
  });
});
