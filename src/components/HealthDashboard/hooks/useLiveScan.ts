import { useState, useEffect } from 'react';

export function useLiveScan() {
  const [timestamp, setTimestamp] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimestamp(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return timestamp;
}
