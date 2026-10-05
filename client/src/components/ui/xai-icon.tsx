import React from 'react';

interface XAIIconProps {
  className?: string;
  size?: number;
  fill?: string;
}

export const XAIIcon: React.FC<XAIIconProps> = ({ 
  className = "", 
  size = 24,
  fill = "currentColor"
}) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg"  
      viewBox="0 0 48 48" 
      width={size} 
      height={size}
      fillRule="evenodd" 
      clipRule="evenodd"
      className={className}
    >
      <polygon 
        fill={fill} 
        fillRule="evenodd" 
        points="24.032,28.919 40.145,5.989 33.145,5.989 20.518,23.958" 
        clipRule="evenodd"
      />
      <polygon 
        fill={fill} 
        fillRule="evenodd" 
        points="14.591,32.393 7.145,42.989 14.145,42.989 18.105,37.354" 
        clipRule="evenodd"
      />
      <polygon 
        fill={fill} 
        fillRule="evenodd" 
        points="14.547,18.989 7.547,18.989 24.547,42.989 31.547,42.989" 
        clipRule="evenodd"
      />
      <polygon 
        fill={fill} 
        fillRule="evenodd" 
        points="35,16.789 35,43 41,43 41,8.251" 
        clipRule="evenodd"
      />
    </svg>
  );
};

export default XAIIcon;
