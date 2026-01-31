import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import StoreSkuDiagram from './StoreSkuDiagram';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    svg: ({ children, ...props }: any) => <svg
        className="w-full h-full"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet" {...props}>{children}</svg>,
    g: ({ children, ...props }: any) => <g {...props}>{children}</g>,
    rect: ({ children, ...props }: any) => <rect {...props}>{children}</rect>,
    circle: ({ children, ...props }: any) => <circle {...props}>{children}</circle>,
  },
}));

test('StoreSkuDiagram renders correctly', () => {
  const { container } = render(<StoreSkuDiagram />);
  expect(container.querySelector('svg')).toBeTruthy();
  expect(container.textContent).toContain('Tienda A');
  expect(container.textContent).toContain('Tienda B');
  expect(container.textContent).toContain('SKU: ARROZ-1KG');
});
