import { useState, useEffect } from 'react';

export function useRunElapsed(isRunning: boolean) {
  const [runElapsed, setRunElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setRunElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setRunElapsed(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [isRunning]);

  return runElapsed;
}
