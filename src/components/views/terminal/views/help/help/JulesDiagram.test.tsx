import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import JulesDiagram from './JulesDiagram';

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
    path: ({ children, ...props }: any) => <path {...props}>{children}</path>,
    line: ({ children, ...props }: any) => <line {...props}>{children}</line>,
  },
}));

test('JulesDiagram renders correctly', () => {
  const { container } = render(<JulesDiagram />);
  expect(container.querySelector('svg')).toBeTruthy();
  expect(container.textContent).toContain('JULES');
  expect(container.textContent).toContain('Pregunta');
  expect(container.textContent).toContain('Respuesta');
});
