import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SafePieChart } from '../SafePieChart';
import { getActionsForUser } from '@/config/actions';
import React from 'react';

// Mock ResizeObserver properly for Recharts
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserver;

describe('SafePieChart', () => {
  it('renders without crashing', () => {
    const data = [{ name: 'Test', value: 100 }];
    render(<SafePieChart data={data} height={200} />);
    expect(document.querySelector('.chart-container')).toBeTruthy();
  });
});

describe('Actions Config', () => {
  it('filters actions by role', () => {
    const adminActions = getActionsForUser('admin');
    const clerkActions = getActionsForUser('clerk');

    expect(adminActions.length).toBeGreaterThan(clerkActions.length);
    expect(adminActions.find(a => a.id === 'users')).toBeTruthy();
    expect(clerkActions.find(a => a.id === 'users')).toBeFalsy();
  });
});
