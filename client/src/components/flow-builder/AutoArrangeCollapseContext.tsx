import React, { createContext, useContext } from 'react';

const AutoArrangeCollapseSignalContext = createContext(0);

export function AutoArrangeCollapseSignalProvider({
  signal,
  children
}: {
  signal: number;
  children: React.ReactNode;
}) {
  return (
    <AutoArrangeCollapseSignalContext.Provider value={signal}>
      {children}
    </AutoArrangeCollapseSignalContext.Provider>
  );
}

export function useAutoArrangeCollapseSignal() {
  return useContext(AutoArrangeCollapseSignalContext);
}
