import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));

import { StorefrontErrorBoundary } from '@/components/StorefrontErrorBoundary';

describe('StorefrontErrorBoundary', () => {
  const originalConsoleError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalConsoleError;
  });

  describe('getDerivedStateFromError', () => {
    it('returns hasError=true with the error object', () => {
      const error = new Error('Test storefront error');
      const result = StorefrontErrorBoundary.getDerivedStateFromError(error);

      expect(result).toEqual({ hasError: true, error });
    });

    it('returns correct shape for different error types', () => {
      const error = new Error('Network timeout');
      const result = StorefrontErrorBoundary.getDerivedStateFromError(error);
      expect(result.hasError).toBe(true);
      expect(result.error).toBe(error);
    });
  });

  describe('render logic', () => {
    it('renders children when no error (hasError=false)', () => {
      const boundary = new StorefrontErrorBoundary({ children: 'child-content' });
      // Default state is { hasError: false, error: null }
      const result = boundary.render();
      expect(result).toBe('child-content');
    });

    it('renders custom fallback when hasError=true and fallback prop is provided', () => {
      const fallback = <div>Custom fallback</div>;
      const boundary = new StorefrontErrorBoundary({ children: null, fallback });
      // Manually set state to simulate error
      boundary.state = { hasError: true, error: new Error('test') };
      const result = boundary.render();
      expect(result).toBe(fallback);
    });

    it('renders error content UI when hasError=true and no fallback', () => {
      const boundary = new StorefrontErrorBoundary({ children: null, storeName: 'Test Store' });
      boundary.state = { hasError: true, error: new Error('test error') };
      const result = boundary.render() as React.ReactElement;
      // Should render StorefrontErrorContent component
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });
  });

  describe('props', () => {
    it('accepts storeName prop for contextual display', () => {
      const boundary = new StorefrontErrorBoundary({ children: null, storeName: 'Mi Tienda' });
      expect(boundary.props.storeName).toBe('Mi Tienda');
    });

    it('accepts fallback prop for custom error UI', () => {
      const fallback = <div>Error occurred</div>;
      const boundary = new StorefrontErrorBoundary({ children: null, fallback });
      expect(boundary.props.fallback).toBe(fallback);
    });

    it('works without optional props', () => {
      const boundary = new StorefrontErrorBoundary({ children: 'test' });
      expect(boundary.props.storeName).toBeUndefined();
      expect(boundary.props.fallback).toBeUndefined();
    });
  });
});
