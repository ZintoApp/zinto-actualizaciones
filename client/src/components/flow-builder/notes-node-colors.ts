import { APP_ICONS } from '@/assets/icons';
export const NOTES_NODE_TYPE = 'notes';

export const NOTES_FLOW_NODE_ICON_SRC =
  APP_ICONS.triggerFlow;

export type NotesBackgroundColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'gray';

export const NOTES_COLOR_PRESETS: Record<
  NotesBackgroundColor,
  {
    labelKey: string;
    labelDefault: string;
    containerClass: string;
    swatchClass: string;
  }
> = {
  yellow: {
    labelKey: 'flow_builder.notes_color_yellow',
    labelDefault: 'Yellow',
    containerClass:
      'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/35 dark:border-yellow-700/80',
    swatchClass: 'bg-yellow-200 dark:bg-yellow-700',
  },
  blue: {
    labelKey: 'flow_builder.notes_color_blue',
    labelDefault: 'Blue',
    containerClass: 'bg-sky-50 border-sky-200 dark:bg-sky-950/35 dark:border-sky-700/80',
    swatchClass: 'bg-sky-200 dark:bg-sky-700',
  },
  green: {
    labelKey: 'flow_builder.notes_color_green',
    labelDefault: 'Green',
    containerClass:
      'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/35 dark:border-emerald-700/80',
    swatchClass: 'bg-emerald-200 dark:bg-emerald-700',
  },
  pink: {
    labelKey: 'flow_builder.notes_color_pink',
    labelDefault: 'Pink',
    containerClass: 'bg-pink-50 border-pink-200 dark:bg-pink-950/35 dark:border-pink-700/80',
    swatchClass: 'bg-pink-200 dark:bg-pink-700',
  },
  purple: {
    labelKey: 'flow_builder.notes_color_purple',
    labelDefault: 'Purple',
    containerClass:
      'bg-violet-50 border-violet-200 dark:bg-violet-950/35 dark:border-violet-700/80',
    swatchClass: 'bg-violet-200 dark:bg-violet-700',
  },
  gray: {
    labelKey: 'flow_builder.notes_color_gray',
    labelDefault: 'Gray',
    containerClass: 'bg-muted/60 border-border dark:bg-muted/30',
    swatchClass: 'bg-muted-foreground/30',
  },
};

export const NOTES_DEFAULT_WIDTH = 300;
export const NOTES_DEFAULT_HEIGHT = 220;
export const NOTES_MIN_WIDTH = 220;
export const NOTES_MIN_HEIGHT = 160;
export const NOTES_IDLE_MIN_WIDTH = 140;
export const NOTES_IDLE_MIN_HEIGHT = 64;

export function isNotesNodeType(type?: string | null): boolean {
  return type === NOTES_NODE_TYPE;
}

export function normalizeNotesBackgroundColor(value: unknown): NotesBackgroundColor {
  if (typeof value === 'string' && value in NOTES_COLOR_PRESETS) {
    return value as NotesBackgroundColor;
  }
  return 'yellow';
}
