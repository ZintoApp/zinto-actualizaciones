import type { CSSProperties } from 'react';
import { Handle, Position } from 'reactflow';

interface StyledHandleProps {
  type: 'source' | 'target';
  position: Position;
  isConnectable: boolean;
  id?: string;
  style?: CSSProperties;
}

export const StyledHandle = ({
  type,
  position,
  style,
  isConnectable,
  id
}: StyledHandleProps) => {
  const baseStyle = {
    width: '10px',
    height: '10px',
    background: '#2d2b2f7d',
    border: '2px solid #8f9093',
  };

  const mergedStyle = { ...baseStyle, ...style };

  return (
    <Handle
      type={type}
      position={position}
      style={mergedStyle}
      isConnectable={isConnectable}
      id={id}
    />
  );
};

export const standardHandleStyle = {
  width: '10px',
  height: '10px',
  background: '#2d2b2f7d',
  border: '2px solid #8f9093',
};

export const yesHandleStyle = {
  width: '10px',
  height: '10px',
  background: '#10b981',
  border: '2px solid #8f9093',
  left: '30%',
};

export const noHandleStyle = {
  width: '10px',
  height: '10px',
  background: '#ef4444',
  border: '2px solid #8f9093',
  left: '70%',
};

const mcpToolBridgeHandleVisual = {
  width: '11px',
  height: '11px',
  background: 'linear-gradient(135deg, #14b8a6 0%, #7c3aed 100%)',
  border: '2px dashed rgba(148, 163, 184, 0.95)',
} as const;

/** MCP tool-input target on AI Assistant (bottom center). */
export const mcpToolInputHandleStyle = {
  ...mcpToolBridgeHandleVisual,
  left: '50%',
  bottom: '-2px',
  transform: 'translateX(-50%)',
} as const satisfies CSSProperties;

/** MCP Client Tool source handle (right center); same palette as `mcpToolInputHandleStyle`. */
export const mcpToolOutputHandleStyle = {
  ...mcpToolBridgeHandleVisual,
  top: '50%',
  right: '-2px',
  transform: 'translateY(-50%)',
} as const satisfies CSSProperties;

/** Google Calendar booking-completed source on AI Assistant (bottom, offset from MCP tool-input target). */
export const calendarBookingCompletedSourceHandleStyle = {
  width: '11px',
  height: '11px',
  background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
  border: '2px solid rgba(251, 191, 36, 0.95)',
  left: '72%',
  bottom: '-2px',
  transform: 'translateX(-50%)',
} as const satisfies CSSProperties;