import { useState, useEffect } from 'react';

/**
 * A custom hook that returns a debounced version of the provided value.
 * Useful for delaying search queries or other performance-intensive operations.
 *
 * @param value The value to debounce
 * @param delay The delay in milliseconds (default: 300)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cancel the timeout if value changes (also on delay change or unmount)
    // This is how we prevent debouncedValue from updating if value is still changing
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
