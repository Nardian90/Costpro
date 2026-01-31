import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import OfflineSyncDiagram from './OfflineSyncDiagram';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
    g: ({ children, ...props }: any) => <g {...props}>{children}</g>,
    rect: ({ children, ...props }: any) => <rect {...props}>{children}</rect>,
    circle: ({ children, ...props }: any) => <circle {...props}>{children}</circle>,
    path: ({ children, ...props }: any) => <path {...props}>{children}</path>,
  },
}));

test('OfflineSyncDiagram renders correctly', () => {
  const { container } = render(<OfflineSyncDiagram />);
  expect(container.querySelector('svg')).toBeTruthy();
  expect(container.textContent).toContain('Operación');
  expect(container.textContent).toContain('Local');
  expect(container.textContent).toContain('Sincro');
  expect(container.textContent).toContain('Nube');
});
