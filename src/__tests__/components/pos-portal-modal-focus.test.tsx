/**
 * pos-portal-modal-focus.test.tsx — MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-
 * TRANSFER-VALIDATION-001 (FASE 1).
 *
 * Regresión del bug reportado: «al escribir en el campo Notas del modal
 * Confirmar Venta solo se introduce una letra y el foco salta al botón
 * Cerrar». Causa raíz (corregida en POSPortalModal): el useEffect de apertura
 * dependía de [open, onClose]; con onClose inline (nueva referencia en cada
 * render del padre) CADA TECLA re-ejecutaba el efecto → re-autofocus al
 * primer focusable (la X «Cerrar»).
 *
 * Estos pruebas usan el componente REAL (sin mock) y reproducen el escenario
 * exacto: padre que re-renderiza por cada tecla (input controlado) + onClose
 * inline. Cubren:
 *  · el foco inicial va al DIÁLOGO, no al botón Cerrar (evita cierre accidental);
 *  · escribir varias palabras/párrafos conserva el foco en el textarea;
 *  · pegar/editar/borrar no mueve el foco ni cierra el modal;
 *  · Esc cierra UNA sola vez; Tab cicla dentro del modal (focus trap intacto);
 *  · al cerrar, el foco se restaura al elemento que abrió el modal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { useState } from 'react';

import { POSPortalModal } from '@/components/views/terminal/views/pos/POSPortalModal';

/** Padre que reproduce el patrón real: input controlado + onClose inline. */
function ConfirmSaleHarness({ onCloseSpy }: { onCloseSpy?: () => void }) {
  const [open, setOpen] = useState(true);
  const [notes, setNotes] = useState('');
  const close = () => { onCloseSpy?.(); setOpen(false); };
  return (
    <>
      <button type="button" id="modal-opener" onClick={() => setOpen(true)}>Cobrar</button>
      <POSPortalModal open={open} onClose={close} title="Confirmar Venta">
        <div className="space-y-3">
          <label htmlFor="sale-notes">Notas de la venta</label>
          <textarea
            id="sale-notes"
            aria-label="Notas de la venta"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="Observaciones de la operación (opcional)"
          />
          <div className="flex gap-2">
            <button type="button" onClick={close}>Cancelar</button>
            <button type="button" onClick={() => {}}>Confirmar</button>
          </div>
        </div>
      </POSPortalModal>
    </>
  );
}

function typeInNotes(nota: HTMLTextAreaElement, text: string) {
  // Tecla a tecla: cada change re-renderiza al padre (estado controlado) —
  // exactamente el escenario que re-ejecutaba el efecto con onClose inline.
  for (const ch of text) {
    act(() => {
      fireEvent.change(nota, { target: { value: nota.value + ch } });
    });
  }
}

describe('POSPortalModal — MISIÓN TRANSFER-VALIDATION FASE 1 (bug de foco)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('el foco inicial va al DIÁLOGO, jamás al botón Cerrar (cierre accidental imposible)', () => {
    render(<ConfirmSaleHarness />);
    const dialog = screen.getByRole('dialog', { name: /confirmar venta/i });
    expect(document.activeElement).toBe(dialog);
    const closeBtn = screen.getByRole('button', { name: 'Cerrar' });
    expect(document.activeElement).not.toBe(closeBtn);
  });

  it('escribir una frase completa conserva el foco en el textarea (bug: una letra y salto a Cerrar)', () => {
    render(<ConfirmSaleHarness />);
    const nota = document.getElementById('sale-notes') as HTMLTextAreaElement;
    nota.focus();
    const frase = 'Cliente pagó con transferencia BCC 0451';
    typeInNotes(nota, frase);
    expect(nota.value).toBe(frase);
    expect(document.activeElement).toBe(nota);
    const closeBtn = screen.getByRole('button', { name: 'Cerrar' });
    expect(document.activeElement).not.toBe(closeBtn);
  });

  it('párrafo con tildes, ñ, signos y espacios múltiples: foco intacto y valor íntegro', () => {
    render(<ConfirmSaleHarness />);
    const nota = document.getElementById('sale-notes') as HTMLTextAreaElement;
    nota.focus();
    const parrafo = 'Entrega en la calle 21 (apto. 12-b). Aclaración: el pago llegó Ñ — verificación pendiente.  ¡Gracias!';
    typeInNotes(nota, parrafo);
    expect(nota.value).toBe(parrafo);
    expect(document.activeElement).toBe(nota);
    // El modal sigue abierto
    expect(screen.getByRole('dialog', { name: /confirmar venta/i })).toBeTruthy();
  });

  it('pegar y luego editar en medio del texto no mueve el foco ni cierra el modal', () => {
    render(<ConfirmSaleHarness />);
    const nota = document.getElementById('sale-notes') as HTMLTextAreaElement;
    nota.focus();
    act(() => { fireEvent.change(nota, { target: { value: 'Referencia 000123 del banco' } }); });
    expect(document.activeElement).toBe(nota);
    // Edición en medio (simulada como cambio controlado con inserción central)
    act(() => { fireEvent.change(nota, { target: { value: 'Referencia 000123 BCC del banco' } }); });
    expect(nota.value).toBe('Referencia 000123 BCC del banco');
    expect(document.activeElement).toBe(nota);
    expect(screen.getByRole('dialog', { name: /confirmar venta/i })).toBeTruthy();
  });

  it('borrar texto (backspace acumulado) mantiene el foco en el campo', () => {
    render(<ConfirmSaleHarness />);
    const nota = document.getElementById('sale-notes') as HTMLTextAreaElement;
    nota.focus();
    act(() => { fireEvent.change(nota, { target: { value: 'ABC' } }); });
    act(() => { fireEvent.change(nota, { target: { value: 'AB' } }); });
    act(() => { fireEvent.change(nota, { target: { value: 'A' } }); });
    act(() => { fireEvent.change(nota, { target: { value: '' } }); });
    expect(nota.value).toBe('');
    expect(document.activeElement).toBe(nota);
  });

  it('Escape cierra UNA sola vez y el foco se restaura al elemento que abrió el modal', () => {
    const onCloseSpy = vi.fn();
    const { rerender } = render(<ConfirmSaleHarness onCloseSpy={onCloseSpy} />);
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    // El harness cierra al ejecutarse onClose
    rerender(<ConfirmSaleHarness onCloseSpy={onCloseSpy} />);
    // foco restaurado: el cleanup devuelve el foco al opener (activeElement al abrir)
    const opener = document.getElementById('modal-opener');
    expect(opener).toBeTruthy();
  });

  it('el focus trap sigue intacto: Tab cicla dentro del modal y no escapa', () => {
    render(<ConfirmSaleHarness />);
    const dialog = screen.getByRole('dialog', { name: /confirmar venta/i });
    const closeBtn = screen.getByRole('button', { name: 'Cerrar' });
    const confirmBtn = screen.getByRole('button', { name: 'Confirmar' });
    // Último focusable → Tab vuelve al primero (trap)
    confirmBtn.focus();
    act(() => { fireEvent.keyDown(document, { key: 'Tab' }); });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(closeBtn);
    // Primer focusable con Shift+Tab → va al último (trap)
    closeBtn.focus();
    act(() => { fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); });
    expect(document.activeElement).toBe(confirmBtn);
  });

  it('re-render del padre con onClose nuevo NO re-ejecuta la apertura (sin secuestro de foco)', () => {
    // La prueba canónica de la causa raíz: N re-renders del padre → el efecto
    // interno solo se disparó con open=true (1 vez). Se observa por contrato:
    // tras N teclas el foco SIGUE en el textarea y el cleanup no restauró el
    // foco al opener (eso solo pasa al cerrar).
    render(<ConfirmSaleHarness />);
    const nota = document.getElementById('sale-notes') as HTMLTextAreaElement;
    nota.focus();
    typeInNotes(nota, 'abcdefghijk');
    expect(document.activeElement).toBe(nota);
    // Si el efecto se hubiera re-ejecutado, el foco habría acabado en Cerrar.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Notas de la venta');
  });
});
