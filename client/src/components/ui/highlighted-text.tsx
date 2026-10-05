import React from 'react';

interface HighlightedTextProps {
  text: string;
  searchTerm: string;
  className?: string;
}

export function HighlightedText({ text, searchTerm, className = '' }: HighlightedTextProps) {
  if (!searchTerm || !text) {
    return <span className={className}>{text}</span>;
  }

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className={className}>
      {parts.map((part, index) => 
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
}

export default HighlightedText;
