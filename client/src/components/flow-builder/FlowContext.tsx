import React, { createContext, ReactNode, useContext } from 'react';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';

interface FlowContextType {
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  flowId?: number | null;
  customVariables: FlowCustomVariable[];
  setCustomVariables: React.Dispatch<React.SetStateAction<FlowCustomVariable[]>>;
}

export const FlowContext = createContext<FlowContextType | null>(null);

export function useFlowContext() {
  const context = useContext(FlowContext);
  if (!context) {
    throw new Error('useFlowContext must be used within a FlowProvider');
  }
  return context;
}

interface FlowProviderProps {
  children: ReactNode;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  flowId?: number | null;
  customVariables?: FlowCustomVariable[];
  setCustomVariables?: React.Dispatch<React.SetStateAction<FlowCustomVariable[]>>;
}

export function FlowProvider({
  children,
  onDeleteNode,
  onDuplicateNode,
  flowId,
  customVariables = [],
  setCustomVariables = () => {},
}: FlowProviderProps) {
  return (
    <FlowContext.Provider
      value={{
        onDeleteNode,
        onDuplicateNode,
        flowId,
        customVariables,
        setCustomVariables,
      }}
    >
      {children}
    </FlowContext.Provider>
  );
}
