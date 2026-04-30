import { render, screen, fireEvent } from '@testing-library/react';
import { ExpertModeAccordion } from '../ExpertModeAccordion';
import { describe, it, expect, vi } from 'vitest';

describe('ExpertModeAccordion', () => {
  const defaultProps = {
    id: 'test-id',
    title: 'Test Accordion',
    isExpanded: false,
    onToggle: vi.fn(),
    onHelp: vi.fn(),
    children: <div>Content</div>
  };

  it('renderiza el título correctamente', () => {
    render(<ExpertModeAccordion {...defaultProps} />);
    expect(screen.getByText('Test Accordion')).toBeInTheDocument();
  });

  it('el trigger es un botón con los atributos ARIA correctos', () => {
    render(<ExpertModeAccordion {...defaultProps} />);
    const button = screen.getByRole('button', { name: /Test Accordion/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'panel-test-id');
  });

  it('muestra el panel expandido cuando isExpanded es true', () => {
    render(<ExpertModeAccordion {...defaultProps} isExpanded={true} />);
    const button = screen.getByRole('button', { name: /Test Accordion/i });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Content')).toBeVisible();
  });

  it('llama a onToggle al hacer click en el header', () => {
    render(<ExpertModeAccordion {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Test Accordion/i }));
    expect(defaultProps.onToggle).toHaveBeenCalled();
  });

  it('llama a onHelp al hacer click en el botón de ayuda', () => {
    render(<ExpertModeAccordion {...defaultProps} />);
    const helpBtn = screen.getByLabelText('Ayuda');
    fireEvent.click(helpBtn);
    expect(defaultProps.onHelp).toHaveBeenCalled();
  });

  it('muestra indicador de errores cuando hasErrors es true', () => {
    const { container } = render(<ExpertModeAccordion {...defaultProps} hasErrors={true} />);
    const pulse = container.querySelector('.animate-pulse');
    expect(pulse).toBeInTheDocument();
  });
});
