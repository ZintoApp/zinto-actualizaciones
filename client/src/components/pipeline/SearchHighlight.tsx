import React from 'react';

interface SearchHighlightProps {
  text: string;
  searchTerm: string;
  className?: string;
}

export default function SearchHighlight({ text, searchTerm, className = '' }: SearchHighlightProps) {
  if (!searchTerm || !text) {
    return <span className={className}>{text}</span>;
  }


  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  

  const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
  

  const parts = text.split(regex);
  
  return (
    <span className={className}>
      {parts.map((part, index) => 
        regex.test(part) ? (
          <mark 
            key={index} 
            className="bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 px-0.5 rounded"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
}
