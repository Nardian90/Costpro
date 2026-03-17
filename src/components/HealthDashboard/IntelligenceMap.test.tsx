import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { IntelligenceMap } from './IntelligenceMap';

describe('IntelligenceMap', () => {
  it('renders correctly with components', () => {
    const mockComponents = [
      { id: 'src_test', name: 'TestComponent', type: 'COMPONENT', health: 9.5, couplingScore: 2.0, openQuestions: [], hasLogic: true }
    ];
    const { getByText } = render(<IntelligenceMap components={mockComponents} />);
    expect(getByText('Mapa de Inteligencia del Sistema')).toBeDefined();
    expect(getByText('TestComponent')).toBeDefined();
    expect(getByText('9.5')).toBeDefined();
    expect(getByText('EXTRAÍDA')).toBeDefined();
  });
});
