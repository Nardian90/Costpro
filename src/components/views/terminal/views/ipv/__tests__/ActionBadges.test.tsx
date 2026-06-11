/**
 * Tests para ActionBadges — badges de reglas aplicadas en IPV.
 * Verifica: renderizado de badges, null cuando no hay reglas.
 */
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import React from 'react';

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

import { ActionBadges } from '../ActionBadges';

describe('ActionBadges', () => {
  it('renderiza null cuando no hay reglas', () => {
    const { container } = render(<ActionBadges appliedRules={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renderiza null cuando appliedRules es undefined', () => {
    const { container } = render(<ActionBadges />);
    expect(container.innerHTML).toBe('');
  });

  it('renderiza badge para regla HARD_REF', () => {
    render(<ActionBadges appliedRules={['HARD_REF']} />);
    expect(screen.getByText('EXACT_MATCH')).toBeInTheDocument();
  });

  it('renderiza badge para regla WILDCARDS', () => {
    render(<ActionBadges appliedRules={['WILDCARDS']} />);
    expect(screen.getByText('WILDCARDS')).toBeInTheDocument();
  });

  it('renderiza múltiples badges para múltiples reglas', () => {
    render(<ActionBadges appliedRules={['HARD_REF', 'PRICE_FLEX', 'WILDCARDS']} />);
    expect(screen.getByText('EXACT_MATCH')).toBeInTheDocument();
    expect(screen.getByText('PRICE_FLEX')).toBeInTheDocument();
    expect(screen.getByText('WILDCARDS')).toBeInTheDocument();
  });

  it('no muestra badges para reglas no reconocidas', () => {
    render(<ActionBadges appliedRules={['UNKNOWN_RULE']} />);
    const badges = screen.queryAllByTestId('badge');
    expect(badges.length).toBe(0);
  });

  it('aplica className personalizado', () => {
    render(<ActionBadges appliedRules={['HARD_REF']} className="custom-class" />);
    const container = screen.getByText('EXACT_MATCH').closest('div');
    expect(container?.className).toContain('custom-class');
  });

  it('no muestra badge para reglas que no coinciden con el mapping', () => {
    render(<ActionBadges appliedRules={['NOT_A_REAL_RULE']} />);
    expect(screen.queryAllByTestId('badge').length).toBe(0);
  });
});
