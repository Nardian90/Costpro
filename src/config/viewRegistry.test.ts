import { describe, it, expect } from 'vitest';
import { VIEW_REGISTRY } from './viewRegistry';
import * as fs from 'fs';
import * as path from 'path';

describe('View Registry Consistency', () => {
  it('should have a corresponding case in TerminalShell.tsx for every registry item', () => {
    const shellPath = path.resolve(/*turbopackIgnore: true*/process.cwd(), 'src/components/views/TerminalShell.tsx');
    const shellContent = fs.readFileSync(shellPath, 'utf-8');

    VIEW_REGISTRY.forEach(view => {
      // Check for 'case 'viewId':' in the shell render function
      const caseRegex = new RegExp(`case ['"]${view.id}['"]:`, 'g');
      const hasCase = caseRegex.test(shellContent);

      expect(hasCase, `View ID '${view.id}' from registry is missing its 'case' in TerminalShell.tsx render function`).toBe(true);
    });
  });

  it('should not have duplicate IDs or routes in the registry', () => {
    const ids = VIEW_REGISTRY.map(v => v.id);
    const routes = VIEW_REGISTRY.map(v => v.route);

    const uniqueIds = new Set(ids);
    const uniqueRoutes = new Set(routes);

    expect(ids.length).toBe(uniqueIds.size);
    expect(routes.length).toBe(uniqueRoutes.size);
  });
});
