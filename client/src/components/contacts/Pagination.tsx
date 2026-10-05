interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const getPageNumbers = () => {
    const pages = [];
    pages.push(1);
    
    if (currentPage > 3) {
      pages.push('...');
    }
    
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      if (i < totalPages) {
        pages.push(i);
      }
    }
    
    if (currentPage < totalPages - 2) {
      pages.push('...');
    }
    
    if (totalPages > 1) {
      pages.push(totalPages);
    }
    
    return pages;
  };
  
  if (totalPages <= 1) return null;
  
  return (
    <div className="flex items-center justify-center space-x-2 mt-6">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className={`px-3 py-1 rounded-md ${
          currentPage === 1
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-background border border-border text-foreground hover:bg-accent'
        }`}
      >
        <i className="ri-arrow-left-s-line"></i>
      </button>
      
      {getPageNumbers().map((page, index) => (
        <button
          key={index}
          onClick={() => typeof page === 'number' ? onPageChange(page) : null}
          className={`px-3 py-1 rounded-md ${
            page === currentPage
              ? 'bg-primary text-primary-foreground'
              : page === '...'
              ? 'bg-background text-muted-foreground cursor-default'
              : 'bg-background border border-border text-foreground hover:bg-accent'
          }`}
        >
          {page}
        </button>
      ))}
      
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className={`px-3 py-1 rounded-md ${
          currentPage === totalPages
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-background border border-border text-foreground hover:bg-accent'
        }`}
      >
        <i className="ri-arrow-right-s-line"></i>
      </button>
    </div>
  );
}