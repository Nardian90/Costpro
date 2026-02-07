import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import EliDiagram from './EliDiagram';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
    g: ({ children, ...props }: any) => <g {...props}>{children}</g>,
    rect: ({ children, ...props }: any) => <rect {...props}>{children}</rect>,
    circle: ({ children, ...props }: any) => <circle {...props}>{children}</circle>,
    path: ({ children, ...props }: any) => <path {...props}>{children}</path>,
    line: ({ children, ...props }: any) => <line {...props}>{children}</line>,
  },
}));

test('EliDiagram renders correctly', () => {
  const { container } = render(<EliDiagram />);
  expect(container.querySelector('svg')).toBeTruthy();
  expect(container.textContent).toContain('ELI');
  expect(container.textContent).toContain('Pregunta');
  expect(container.textContent).toContain('Respuesta');
});
