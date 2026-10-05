import { useId, useMemo, type SVGProps } from 'react';
import { queueIconArtwork } from './queue-icon-artwork';

// Decode only bundled artwork, once. Inline rendering lets the existing brand
// CSS variables keep working; an <img> data URL would isolate those variables.
const decodedArtwork = Object.fromEntries(Object.entries(queueIconArtwork).map(([name, dataUrl]) => {
  const svg = new TextDecoder().decode(Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0)));
  return [name, svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))];
}));

export function QueueEmbeddedIcon({ artwork, ...props }: SVGProps<SVGSVGElement> & { artwork: keyof typeof queueIconArtwork }) {
  const prefix = useId();
  const markup = useMemo(() => ({ __html: decodedArtwork[artwork].split('__QUEUE_ICON_ID__').join(prefix) }), [artwork, prefix]);
  return <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={markup} />;
}
