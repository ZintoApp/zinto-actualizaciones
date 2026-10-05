import { createContext } from 'react';

// Floating controls rendered from a modal must stay inside the dialog DOM tree.
// Otherwise the dialog's scroll lock treats their portalled content as outside
// content and blocks mouse-wheel and touch scrolling.
export const DialogPortalContainerContext = createContext<HTMLElement | null>(null);
