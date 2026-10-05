import React from 'react';

interface OpenRouterIconProps {
  className?: string;
  size?: number;
}

export const OpenRouterIcon: React.FC<OpenRouterIconProps> = ({
  className = '',
  size = 24,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-45 32.23 556.5 433.48"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      stroke="currentColor"
      role="img"
      aria-label="OpenRouter"
    >
      <title>OpenRouter</title>
      <path
        d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945"
        fill="none"
        stroke="currentColor"
        strokeWidth="90"
      />
      <path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z" stroke="none" />
      <path
        d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377"
        fill="none"
        stroke="currentColor"
        strokeWidth="90"
      />
      <path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z" stroke="none" />
    </svg>
  );
};

export default OpenRouterIcon;
