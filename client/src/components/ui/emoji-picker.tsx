import React, { useState, useEffect, useRef, useCallback } from 'react';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface EmojiPickerComponentProps {
  isOpen: boolean;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
  anchorRef: React.RefObject<HTMLElement>;
  className?: string;
}

interface RecentEmoji {
  emoji: string;
  timestamp: number;
  count: number;
}

const RECENT_EMOJIS_KEY = 'bothive_recent_emojis';
const MAX_RECENT_EMOJIS = 24;

export default function EmojiPickerComponent({
  isOpen,
  onClose,
  onEmojiSelect,
  anchorRef,
  className
}: EmojiPickerComponentProps) {
  const { t } = useTranslation();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [recentEmojis, setRecentEmojis] = useState<RecentEmoji[]>([]);
  const [position, setPosition] = useState<{ top: number; left: number; bottom?: number }>({ top: 0, left: 0 });
  const [isMobile, setIsMobile] = useState(false);


  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentEmoji[];
        setRecentEmojis(parsed.sort((a, b) => b.timestamp - a.timestamp));
      }
    } catch (error) {
      console.error('Failed to load recent emojis:', error);
    }
  }, []);


  const saveRecentEmojis = useCallback((emojis: RecentEmoji[]) => {
    try {
      localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(emojis));
    } catch (error) {
      console.error('Failed to save recent emojis:', error);
    }
  }, []);


  const addToRecent = useCallback((emoji: string) => {
    setRecentEmojis(prev => {
      const existing = prev.find(item => item.emoji === emoji);
      let updated: RecentEmoji[];

      if (existing) {

        updated = prev.map(item =>
          item.emoji === emoji
            ? { ...item, timestamp: Date.now(), count: item.count + 1 }
            : item
        );
      } else {

        const newEmoji: RecentEmoji = {
          emoji,
          timestamp: Date.now(),
          count: 1
        };
        updated = [newEmoji, ...prev];
      }


      updated = updated
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_RECENT_EMOJIS);

      saveRecentEmojis(updated);
      return updated;
    });
  }, [saveRecentEmojis]);


  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    addToRecent(emoji);
    onEmojiSelect(emoji);
    onClose();
  }, [addToRecent, onEmojiSelect, onClose]);


  useEffect(() => {
    if (!isOpen || !anchorRef.current || isMobile) return;

    const updatePosition = () => {
      if (!anchorRef.current || isMobile) return;

      const anchorRect = anchorRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;


      let pickerWidth = 320;
      let pickerHeight = 400;

      if (pickerRef.current) {
        const pickerRect = pickerRef.current.getBoundingClientRect();
        if (pickerRect.width > 0) pickerWidth = pickerRect.width;
        if (pickerRect.height > 0) pickerHeight = pickerRect.height;
      }


      let top = anchorRect.top - pickerHeight - 8;
      let left = anchorRect.left;
      let bottom: number | undefined;


      if (top < 8) {
        top = anchorRect.bottom + 8;
        bottom = undefined;
      }


      if (top + pickerHeight > viewportHeight - 8) {
        top = anchorRect.top - pickerHeight - 8;

        if (top < 8) {
          top = 8;
        }
      }



      if (left + pickerWidth > viewportWidth - 8) {

        left = anchorRect.right - pickerWidth;

        if (left < 8) {
          left = viewportWidth - pickerWidth - 8;
        }
      }


      if (left < 8) {
        left = 8;
      }

      setPosition({ top, left, bottom });
    };


    const timeoutId = setTimeout(updatePosition, 10);


    updatePosition();


    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen, anchorRef, isMobile]);


  useEffect(() => {
    if (!isOpen || !anchorRef.current || !pickerRef.current || isMobile) return;

    const timeoutId = setTimeout(() => {
      if (!anchorRef.current || isMobile) return;

      const anchorRect = anchorRef.current.getBoundingClientRect();
      const pickerRect = pickerRef.current?.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      if (!pickerRect) return;

      let top = anchorRect.top - pickerRect.height - 8;
      let left = anchorRect.left;

      if (top < 8) {
        top = anchorRect.bottom + 8;
      }

      if (top + pickerRect.height > viewportHeight - 8) {
        top = anchorRect.top - pickerRect.height - 8;
        if (top < 8) {
          top = 8;
        }
      }

      if (left + pickerRect.width > viewportWidth - 8) {
        left = anchorRect.right - pickerRect.width;
        if (left < 8) {
          left = viewportWidth - pickerRect.width - 8;
        }
      }

      if (left < 8) {
        left = 8;
      }

      setPosition({ top, left });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [isOpen, pickerRef.current, isMobile]);


  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop for mobile */}
      <div className="fixed inset-0 z-40 bg-black bg-opacity-25 md:hidden" onClick={onClose} />
      
      {/* Emoji Picker */}
      <div
        ref={pickerRef}
        className={cn(
          "fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200",
          "max-w-sm md:max-w-none",
          isMobile ? "emoji-picker-container" : "",
          className
        )}
        style={isMobile ? {} : {
          position: 'fixed',
          top: position.top,
          left: position.left,
          bottom: position.bottom,
          zIndex: 9999,
        }}
        role="dialog"
        aria-label={t('emoji.picker_title', 'Select Emoji')}
        aria-modal="true"
      >
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between p-3 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {t('emoji.picker_title', 'Select Emoji')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100"
            aria-label={t('common.close', 'Close')}
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Recent Emojis Section */}
        {recentEmojis.length > 0 && (
          <div className="p-3 border-b border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              {t('emoji.recent', 'Recently Used')}
            </h4>
            <div className="grid grid-cols-8 gap-1">
              {recentEmojis.slice(0, 16).map((item, index) => (
                <button
                  key={`${item.emoji}-${index}`}
                  onClick={() => handleEmojiClick({ emoji: item.emoji } as EmojiClickData)}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded transition-colors"
                  title={`${item.emoji} (used ${item.count} times)`}
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Emoji Picker */}
        <div className="emoji-picker-container">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={Theme.LIGHT}
            emojiStyle={EmojiStyle.NATIVE}
            width={320}
            height={400}
            searchPlaceholder={t('emoji.search_placeholder', 'Search emojis...')}
            previewConfig={{
              showPreview: false
            }}
            skinTonesDisabled={false}
            searchDisabled={false}
            autoFocusSearch={true}
            lazyLoadEmojis={true}
          />
        </div>
      </div>
    </>
  );
}
