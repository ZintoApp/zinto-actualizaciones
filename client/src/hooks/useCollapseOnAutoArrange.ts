import { useEffect, useRef } from 'react';
import { useAutoArrangeCollapseSignal } from '@/components/flow-builder/AutoArrangeCollapseContext';

/**
 * Collapses node edit/expand UI when the user runs Auto-Arrange (signal increments).
 */
export function useCollapseOnAutoArrange(setState: React.Dispatch<React.SetStateAction<boolean>>) {
  const signal = useAutoArrangeCollapseSignal();
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = signal;
      return;
    }
    if (signal !== seen.current) {
      seen.current = signal;
      setState(false);
    }
  }, [signal, setState]);
}
