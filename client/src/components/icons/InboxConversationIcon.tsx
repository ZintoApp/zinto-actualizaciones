import * as React from 'react';
import type { LucideProps } from 'lucide-react';

/** Shared inbox/conversation mark. Uses the surrounding control's size and color. */
export const InboxConversationIcon = React.forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, absoluteStrokeWidth: _absoluteStrokeWidth, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      fill="currentColor"
      aria-hidden={props['aria-label'] || props['aria-labelledby'] ? undefined : true}
      focusable="false"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M22 6.67C22 5.19 20.8 4 19.33 4H1.8a1 1 0 0 0-.85 1.53L3 9v8.33C3 18.81 4.2 20 5.67 20h13.66c1.48 0 2.67-1.2 2.67-2.67V6.67ZM7 10a1 1 0 0 1 1-1h9a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H8Z"
        clipRule="evenodd"
      />
    </svg>
  ),
);
InboxConversationIcon.displayName = 'InboxConversationIcon';
