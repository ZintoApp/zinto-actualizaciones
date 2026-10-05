import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import {
  User,
  FileText,
  Clock,
  Phone,
  Mail,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface SearchDropdownProps {
  isOpen: boolean;
  isLoading: boolean;
  results: SearchResult;
  onClose: () => void;
  onSelect: () => void;
  query: string;
}

export function SearchDropdown({ 
  isOpen, 
  isLoading, 
  results, 
  onClose, 
  onSelect,
  query 
}: SearchDropdownProps) {
  const [_, navigate] = useLocation();
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const totalResults = results.conversations.length + results.contacts.length + results.templates.length;

  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % totalResults);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev <= 0 ? totalResults - 1 : prev - 1);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0) {
            handleSelectByIndex(selectedIndex);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, totalResults]);

  const handleSelectByIndex = (index: number) => {
    let currentIndex = 0;

    if (index < results.conversations.length) {
      const conversation = results.conversations[index];
      localStorage.setItem('selectedContactId', conversation.contact.id.toString());
      localStorage.setItem('selectedChannelType', conversation.channelType || 'whatsapp');
      navigate('/inbox');
      onSelect();
      return;
    }
    currentIndex += results.conversations.length;

    if (index < currentIndex + results.contacts.length) {
      const contact = results.contacts[index - currentIndex];
      localStorage.setItem('selectedContactId', contact.id.toString());
      localStorage.setItem('selectedChannelType', contact.identifierType || 'whatsapp');
      navigate('/inbox');
      onSelect();
      return;
    }
    currentIndex += results.contacts.length;

    if (index < currentIndex + results.templates.length) {
      navigate('/campaigns/templates');
      onSelect();
      return;
    }
  };

  const handleConversationClick = (conversation: any) => {
    localStorage.setItem('selectedContactId', conversation.contact.id.toString());
    localStorage.setItem('selectedChannelType', conversation.channelType || 'whatsapp');
    navigate('/inbox');
    onSelect();
  };

  const handleContactClick = (contact: any) => {
    localStorage.setItem('selectedContactId', contact.id.toString());
    localStorage.setItem('selectedChannelType', contact.identifierType || 'whatsapp');
    navigate('/inbox');
    onSelect();
  };

  const handleTemplateClick = () => {
    navigate('/campaigns/templates');
    onSelect();
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString();
    }
  };

  const truncateText = (text: string, maxLength: number = 50) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
    >
      {isLoading ? (
        <div className="p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm text-gray-500">{t('common.searching', 'Searching...')}</span>
        </div>
      ) : (
        <>
          {totalResults === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <div className="text-sm">
                {t('search.no_results', 'No results found for "{{query}}"', { query })}
              </div>
            </div>
          ) : (
            <div className="py-2">
              {results.conversations.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                    {t('search.conversations', 'Conversations')}
                  </div>
                  {results.conversations.map((conversation, index) => (
                    <button
                      key={`conversation-${conversation.id}`}
                      className={cn(
                        "w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-3",
                        selectedIndex === index && "bg-gray-50"
                      )}
                      onClick={() => handleConversationClick(conversation)}
                    >
                      <InboxConversationIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {conversation.contact.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(conversation.lastMessageAt)}
                          </span>
                        </div>
                        {conversation.lastMessage && (
                          <div className="text-xs text-gray-500 truncate">
                            {truncateText(conversation.lastMessage.content)}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.contacts.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                    {t('search.contacts', 'Contacts')}
                  </div>
                  {results.contacts.map((contact, index) => {
                    const globalIndex = results.conversations.length + index;
                    return (
                      <button
                        key={`contact-${contact.id}`}
                        className={cn(
                          "w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-3",
                          selectedIndex === globalIndex && "bg-gray-50"
                        )}
                        onClick={() => handleContactClick(contact)}
                      >
                        <User className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {contact.name}
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            {contact.phone && (
                              <div className="flex items-center">
                                <Phone className="h-3 w-3 mr-1" />
                                {contact.phone}
                              </div>
                            )}
                            {contact.email && (
                              <div className="flex items-center">
                                <Mail className="h-3 w-3 mr-1" />
                                {contact.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {results.templates.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                    {t('search.templates', 'Templates')}
                  </div>
                  {results.templates.map((template, index) => {
                    const globalIndex = results.conversations.length + results.contacts.length + index;
                    return (
                      <button
                        key={`template-${template.id}`}
                        className={cn(
                          "w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-3",
                          selectedIndex === globalIndex && "bg-gray-50"
                        )}
                        onClick={handleTemplateClick}
                      >
                        <FileText className="h-4 w-4 text-purple-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {template.name}
                          </div>
                          {template.description && (
                            <div className="text-xs text-gray-500 truncate">
                              {truncateText(template.description)}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
