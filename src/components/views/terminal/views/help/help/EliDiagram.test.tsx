import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import EliDiagram from './EliDiagram';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
    g: ({ children, ...props }: any) => <g {...props}>{children}</g>,
    circle: (props: any) => <circle {...props} />,
    line: (props: any) => <line {...props} />,
    text: ({ children, ...props }: any) => <text {...props}>{children}</text>,
  },
}));

test('EliDiagram renders correctly', () => {
  const { container } = render(<EliDiagram />);

  expect(container.querySelector('svg')).toBeTruthy();
  expect(container.textContent).toContain('ELI');
  expect(container.textContent).toContain('Predictivo');
  expect(container.textContent).toContain('Offline');
});
