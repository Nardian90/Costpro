import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssistedModeShell } from '../AssistedModeShell';
import React from 'react';

// Mock the components that rely on heavy stores or logic
vi.mock('../InteractiveCostMap', () => ({
  InteractiveCostMap: () => <div data-testid="interactive-map">Map</div>
}));

vi.mock('../AssistedModeSidebar', () => ({
  AssistedModeSidebar: () => <div data-testid="assisted-sidebar">Sidebar</div>
}));

vi.mock('../ContextualPanelManager', () => ({
  ContextualPanelManager: () => <div data-testid="contextual-panel">Panel</div>
}));

describe('AssistedModeShell', () => {
  it('renders correctly with all sub-components', () => {
    render(<AssistedModeShell />);
    expect(screen.getByTestId('interactive-map')).toBeDefined();
    expect(screen.getByTestId('assisted-sidebar')).toBeDefined();
    expect(screen.getByTestId('contextual-panel')).toBeDefined();
  });
});
