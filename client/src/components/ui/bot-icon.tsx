import { APP_ICONS } from '@/assets/icons';
import React from 'react';

const INBOX_BOT_ICON_URL = APP_ICONS.inboxBot;

interface BotIconProps {
  className?: string;
  size?: number;
  color?: string;
}

export const BotIcon: React.FC<BotIconProps> = ({
  className = '',
  size = 16,
  color,
}) => {
  return (
    <img
      src={INBOX_BOT_ICON_URL}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    />
  );
};

export default BotIcon;
