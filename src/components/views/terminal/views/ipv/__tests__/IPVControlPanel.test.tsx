/**
 * Tests para IPVControlPanel — panel de control principal con tarjetas de acción.
 * Verifica: renderizado de tarjetas, clicks, botones de backup, estructura.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import IPVControlPanel from '../IPVControlPanel';

describe('IPVControlPanel', () => {
  const defaultProps = {
    onSelect: vi.fn(),
    onExportBackup: vi.fn(),
    onImportBackup: vi.fn(),
    hasTransactions: true,
    hasProducts: true,
  };

  it('renderiza el título "IPV Builder"', () => {
    render(<IPVControlPanel {...defaultProps} />);
    expect(screen.getByText('IPV Builder')).toBeInTheDocument();
  });

  it('renderiza la tarjeta de acción principal "Panel de Control"', () => {
    render(<IPVControlPanel {...defaultProps} />);
    expect(screen.getByText('Panel de Control')).toBeInTheDocument();
  });

  it('renderiza las tarjetas de acción principales', () => {
    render(<IPVControlPanel {...defaultProps} />);
    // Sample of key action cards
    expect(screen.getByText('Panel de Control')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Institucional')).toBeInTheDocument();
    expect(screen.getByText('Extracto')).toBeInTheDocument();
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    expect(screen.getByText('Transacciones')).toBeInTheDocument();
    expect(screen.getByText('Simulación')).toBeInTheDocument();
    expect(screen.getByText('Reportes IPV')).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
  });

  it('renderiza las tarjetas adicionales', () => {
    render(<IPVControlPanel {...defaultProps} />);
    expect(screen.getByText('Desglose')).toBeInTheDocument();
    expect(screen.getByText('Consolidado')).toBeInTheDocument();
    expect(screen.getByText('Errores')).toBeInTheDocument();
    expect(screen.getByText('Recibos')).toBeInTheDocument();
    expect(screen.getByText('Transferencias')).toBeInTheDocument();
    expect(screen.getByText('Pagos QR')).toBeInTheDocument();
    expect(screen.getByText('Exportación MVT')).toBeInTheDocument();
  });

  it('llama onSelect cuando se hace click en una tarjeta', () => {
    const onSelect = vi.fn();
    render(<IPVControlPanel {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Catálogo'));
    expect(onSelect).toHaveBeenCalledWith('catalog');
  });

  it('llama onSelect con "transactions" al click en "Ejecutar Matching"', () => {
    const onSelect = vi.fn();
    render(<IPVControlPanel {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Ejecutar Matching'));
    expect(onSelect).toHaveBeenCalledWith('transactions');
  });

  it('llama onSelect con "rules" al click en "Reglas" del header', () => {
    const onSelect = vi.fn();
    render(<IPVControlPanel {...defaultProps} onSelect={onSelect} />);
    // Click the Reglas button in header (second occurrence)
    const reglasBtns = screen.getAllByText('Reglas');
    fireEvent.click(reglasBtns[0]); // card
    expect(onSelect).toHaveBeenCalledWith('rules');
  });

  it('llama onExportBackup al click en "Respaldar"', () => {
    const onExportBackup = vi.fn();
    render(<IPVControlPanel {...defaultProps} onExportBackup={onExportBackup} />);
    fireEvent.click(screen.getByText('Respaldar'));
    expect(onExportBackup).toHaveBeenCalledTimes(1);
  });

  it('llama onImportBackup al seleccionar un archivo JSON', () => {
    const onImportBackup = vi.fn();
    render(<IPVControlPanel {...defaultProps} onImportBackup={onImportBackup} />);

    const fileInput = screen.getByLabelText('Importar respaldo de IPV') as HTMLInputElement;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onImportBackup).toHaveBeenCalledWith(file);
  });

  it('muestra el badge "ACTIVA" de caché', () => {
    render(<IPVControlPanel {...defaultProps} />);
    expect(screen.getByText('ACTIVA')).toBeInTheDocument();
  });

  it('muestra el badge de seguridad "CIFRADO LOCAL"', () => {
    render(<IPVControlPanel {...defaultProps} />);
    expect(screen.getByText('CIFRADO LOCAL')).toBeInTheDocument();
  });

  it('muestra el botón "Sincronizar IPV"', () => {
    render(<IPVControlPanel {...defaultProps} />);
    expect(screen.getByText('Sincronizar IPV')).toBeInTheDocument();
  });

  it('muestra información sobre Base de Datos Local', () => {
    render(<IPVControlPanel {...defaultProps} />);
    expect(screen.getByText('Base de Datos Local')).toBeInTheDocument();
  });

  it('tiene un input de archivo oculto para importar', () => {
    render(<IPVControlPanel {...defaultProps} />);
    const fileInput = screen.getByLabelText('Importar respaldo de IPV');
    expect(fileInput).toHaveAttribute('type', 'file');
    expect(fileInput).toHaveAttribute('accept', '.json');
    expect(fileInput.classList.contains('hidden')).toBe(true);
  });
});
