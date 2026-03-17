import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { ObservabilityHeader } from './ObservabilityHeader';

describe('ObservabilityHeader', () => {
  it('renders correctly', () => {
    const { getByText, getAllByText } = render(
      <ObservabilityHeader
        score={90}
        status="HEALTHY"
        version="5.8.0"
        scanFrequency="30S"
        setScanFrequency={() => {}}
      />
    );
    expect(getByText('Observability')).toBeDefined();
    expect(getByText('90')).toBeDefined();
    // Use getAllByText because HEALTHY appears in multiple places (badge and status card)
    expect(getAllByText('HEALTHY').length).toBeGreaterThan(0);
  });
});
