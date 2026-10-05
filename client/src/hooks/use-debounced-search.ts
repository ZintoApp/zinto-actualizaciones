import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

interface SearchResult {
  conversations: Array<{
    id: number;
    status: string;
    channelType: string;
    lastMessageAt: string;
    contact: {
      id: number;
      name: string;
      phone?: string;
      email?: string;
    };
    lastMessage: {
      content: string;
      createdAt: string;
    } | null;
  }>;
  contacts: Array<{
    id: number;
    name: string;
    phone?: string;
    email?: string;
    identifierType: string;
  }>;
  templates: Array<{
    id: number;
    name: string;
    content?: string;
    description?: string;
    channelType: string;
  }>;
}

const EMPTY_SEARCH_RESULTS: SearchResult = {
  conversations: [],
  contacts: [],
  templates: [],
};

export function useDebouncedSearch(delay: number = 300) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);


  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, delay);

    return () => clearTimeout(timer);
  }, [searchQuery, delay]);


  useEffect(() => {
    if (!searchQuery.trim()) {
      setIsOpen(false);
    }
  }, [searchQuery]);


  const { data, isLoading, error } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: async (): Promise<SearchResult> => {
      if (!debouncedQuery.trim() || debouncedQuery.length < 2) {
        return EMPTY_SEARCH_RESULTS;
      }

      const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=5`);
      if (!response.ok) {
        throw new Error('Search failed');
      }
      return response.json();
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim().length >= 2) {
      setIsOpen(true);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setIsOpen(false);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openDropdown = useCallback(() => {
    if (searchQuery.trim().length >= 2) {
      setIsOpen(true);
    }
  }, [searchQuery]);

  return {
    searchQuery,
    debouncedQuery,
    isOpen,
    isLoading: isLoading && debouncedQuery.length >= 2,
    error,
    results: data || EMPTY_SEARCH_RESULTS,
    handleSearch,
    clearSearch,
    closeDropdown,
    openDropdown,
  };
}
