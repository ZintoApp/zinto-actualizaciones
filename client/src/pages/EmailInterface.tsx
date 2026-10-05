import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { useParams } from 'wouter';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useTranslation } from '@/hooks/use-translation';
import useSocket from '@/hooks/useSocket';
import Header from '@/components/layout/Header';
import { EmailSidebar, EmailList, EmailComposer, EmailViewer } from '@/components/email';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, RefreshCw, Menu, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface EmailFolder {
  id: string;
  name: string;
  count: number;
  type: 'inbox' | 'sent' | 'drafts' | 'starred' | 'archive' | 'trash' | 'custom';
}

interface EmailMessage {
  id: number;
  conversationId: number;
  subject: string;
  from: string;
  to: string;
  content: string;
  htmlContent?: string;
  isRead: boolean;
  hasAttachments: boolean;
  createdAt: string;
  metadata?: any;
}

interface EmailPage {
  emails: EmailMessage[];
  nextPage?: number;
  hasMore: boolean;
}

export default function EmailInterface() {
  const { channelId } = useParams<{ channelId: string }>();

  const { t } = useTranslation();
  const { toast } = useToast();
  const { onMessage } = useSocket('/ws');
  const queryClient = useQueryClient();




  const [selectedFolder, setSelectedFolder] = useState<string>('inbox');


  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);


  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showEmailList, setShowEmailList] = useState(true);
  const [showEmailSidebar, setShowEmailSidebar] = useState(true);


  const [isLoadingMore, setIsLoadingMore] = useState(false);


  const [error, setError] = useState<string | null>(null);

  // Same EmailInterface instance is reused across `/email/:channelId`; reset channel-scoped UI
  // state on navigation so we do not show the previous channel's selection or composer.
  useLayoutEffect(() => {
    setSelectedEmail(null);
    setIsComposing(false);
    setError(null);
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setSelectedFolder('inbox');
    setIsLoadingMore(false);

    const width = window.innerWidth;
    if (width < 768) {
      setShowEmailSidebar(false);
      setShowEmailList(true);
    } else {
      setShowEmailSidebar(true);
      setShowEmailList(true);
    }
  }, [channelId]);

  const { data: channelConnection } = useQuery({
    queryKey: ['/api/channel-connections', channelId],
    queryFn: async () => {
      const response = await fetch(`/api/channel-connections/${channelId}`);
      if (!response.ok) throw new Error('Failed to fetch channel connection');
      return response.json();
    },
    enabled: !!channelId
  });


  const { data: folders = [] } = useQuery<EmailFolder[]>({
    queryKey: ['/api/email/folders', channelId],
    queryFn: async () => {

      return [
        { id: 'inbox', name: 'Inbox', count: 0, type: 'inbox' },
        { id: 'sent', name: 'Sent', count: 0, type: 'sent' },
        { id: 'drafts', name: 'Drafts', count: 0, type: 'drafts' },
        { id: 'starred', name: 'Starred', count: 0, type: 'starred' },
        { id: 'archive', name: 'Archived', count: 0, type: 'archive' },
        { id: 'trash', name: 'Trash', count: 0, type: 'trash' }
      ];
    },
    enabled: !!channelId
  });


  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);


  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);


      if (width < 768) {
        setShowEmailSidebar(false);
        if (selectedEmail || isComposing) {
          setShowEmailList(false);
        }
      } else {
        setShowEmailSidebar(true);
        setShowEmailList(true);
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [selectedEmail, isComposing]);


  const {
    data: emailPages,
    fetchNextPage,
    hasNextPage: hasMoreEmails,
    isFetchingNextPage,
    refetch: refetchEmails,
    isLoading: isLoadingEmails
  } = useInfiniteQuery<EmailPage, Error>({
    queryKey: ['/api/email/messages', channelId, selectedFolder, debouncedSearchQuery],
    queryFn: async ({ pageParam = 1 }): Promise<EmailPage> => {
      const params = new URLSearchParams({
        folder: selectedFolder,
        page: (pageParam as number).toString(),
        limit: '20',
        ...(debouncedSearchQuery && { search: debouncedSearchQuery })
      });

      const response = await fetch(`/api/email/${channelId}/messages?${params}`);
      if (!response.ok) throw new Error('Failed to fetch emails');
      const data = await response.json();

      return {
        emails: data.emails || data,
        nextPage: data.hasMore ? (pageParam as number) + 1 : undefined,
        hasMore: data.hasMore || false
      };
    },
    getNextPageParam: (lastPage: EmailPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: !!channelId,
    refetchInterval: 30000
  });


  const emails = emailPages?.pages.flatMap((page: EmailPage) => page.emails) || [];

  useEffect(() => {
    if (!selectedEmail) return;
    if (!emails.some((e) => e.id === selectedEmail.id)) {
      setSelectedEmail(null);
      if (isMobile) setShowEmailList(true);
    }
  }, [emails, selectedEmail, isMobile]);

  const loadMoreEmails = useCallback(async () => {
    if (hasMoreEmails && !isFetchingNextPage) {
      setIsLoadingMore(true);
      try {
        await fetchNextPage();
      } catch (error) {
        console.error('Error fetching next page:', error);
      } finally {
        setIsLoadingMore(false);
      }
    }
  }, [hasMoreEmails, isFetchingNextPage, fetchNextPage]);


  useEffect(() => {

    const unsubscribeNewEmail = onMessage('newEmail', (data: any) => {
      if (data.data && data.data.channelId === parseInt(channelId || '0')) {


        queryClient.invalidateQueries({
          queryKey: ['/api/email/messages'],
          exact: false
        });
        refetchEmails();


        const { message: emailMessage, contact } = data.data;
        toast({
          title: t('email.new_email', 'New Email'),
          description: `From: ${contact?.email || contact?.name || emailMessage?.fromAddress || 'Unknown'}`,
          duration: 5000,
        });
      }
    });


    const unsubscribeNewMessage = onMessage('newMessage', (data: any) => {
      if (data.data && data.data.conversationId) {


        queryClient.invalidateQueries({
          queryKey: ['/api/email/messages'],
          exact: false
        });
        refetchEmails();

        toast({
          title: t('email.new_message', 'New Email'),
          description: `${data.data.fromAddress || 'New message received'}`,
          duration: 3000,
        });
      }
    });


    const unsubscribeConversationUpdated = onMessage('conversationUpdated', (data: any) => {
      if (data.data && data.data.channelId === parseInt(channelId || '0')) {
        queryClient.invalidateQueries({
          queryKey: ['/api/email/messages'],
          exact: false
        });
      }
    });


    const unsubscribeMessageUpdated = onMessage('messageUpdated', (data: any) => {
      if (data.data && data.data.messageId) {




        queryClient.setQueryData(['/api/email/messages', channelId, selectedFolder, debouncedSearchQuery], (oldData: any) => {
          if (!oldData) return oldData;


          if (oldData.pages) {
            return {
              ...oldData,
              pages: oldData.pages.map((page: any) => ({
                ...page,
                emails: page.emails.map((email: any) => {
                  if (email.id === data.data.messageId) {

                    const updates = data.data.updates || {};
                    return {
                      ...email,

                      ...(updates.readAt !== undefined && {
                        isRead: !!updates.readAt,
                        readAt: updates.readAt
                      }),

                      ...(updates.starred !== undefined && {
                        metadata: {
                          ...email.metadata,
                          starred: updates.starred
                        }
                      }),

                      ...(updates.archived !== undefined && {
                        metadata: {
                          ...email.metadata,
                          archived: updates.archived
                        }
                      }),

                      ...(updates.deleted !== undefined && {
                        metadata: {
                          ...email.metadata,
                          deleted: updates.deleted
                        },
                        status: updates.status || email.status
                      })
                    };
                  }
                  return email;
                })
              }))
            };
          }


          if (oldData.emails) {
            return {
              ...oldData,
              emails: oldData.emails.map((email: any) => {
                if (email.id === data.data.messageId) {
                  const updates = data.data.updates || {};
                  return {
                    ...email,
                    ...(updates.readAt !== undefined && {
                      isRead: !!updates.readAt,
                      readAt: updates.readAt
                    }),
                    ...(updates.starred !== undefined && {
                      metadata: {
                        ...email.metadata,
                        starred: updates.starred
                      }
                    }),
                    ...(updates.archived !== undefined && {
                      metadata: {
                        ...email.metadata,
                        archived: updates.archived
                      }
                    }),
                    ...(updates.deleted !== undefined && {
                      metadata: {
                        ...email.metadata,
                        deleted: updates.deleted
                      },
                      status: updates.status || email.status
                    })
                  };
                }
                return email;
              })
            };
          }

          return oldData;
        });


        queryClient.invalidateQueries({
          queryKey: ['/api/email/messages'],
          exact: false // This will match all email message queries regardless of folder/search
        });
      }
    });


    const unsubscribeMessageDeleted = onMessage('messageDeleted', (data: any) => {
      if (data.data && data.data.messageId) {



        queryClient.setQueryData(['/api/email/messages', channelId, selectedFolder, debouncedSearchQuery], (oldData: any) => {
          if (!oldData) return oldData;


          if (oldData.pages) {
            return {
              ...oldData,
              pages: oldData.pages.map((page: any) => ({
                ...page,
                emails: page.emails.filter((email: any) => email.id !== data.data.messageId)
              }))
            };
          }


          if (oldData.emails) {
            return {
              ...oldData,
              emails: oldData.emails.filter((email: any) => email.id !== data.data.messageId)
            };
          }

          return oldData;
        });


        if (selectedEmail?.id === data.data.messageId) {
          setSelectedEmail(null);
          if (isMobile) setShowEmailList(true);
        }


        queryClient.invalidateQueries({
          queryKey: ['/api/email/messages'],
          exact: false
        });
      }
    });

    return () => {
      unsubscribeNewEmail();
      unsubscribeNewMessage();
      unsubscribeConversationUpdated();
      unsubscribeMessageUpdated();
      unsubscribeMessageDeleted();
    };
  }, [channelId, onMessage, refetchEmails, toast, t, queryClient, selectedFolder, debouncedSearchQuery, selectedEmail, isMobile, setSelectedEmail, setShowEmailList]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key) {
        case 'c':
          if (event.ctrlKey || event.metaKey) return; // Allow Ctrl+C
          handleCompose();
          break;
        case 'r':
          if (selectedEmail && !isComposing) {
            handleReply();
          }
          break;
        case 'f':
          if (selectedEmail && !isComposing) {
            handleForward();
          }
          break;
        case 'a':
          if (selectedEmail && !isComposing) {
            handleArchiveEmail(selectedEmail.id);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedEmail && !isComposing) {
            handleDeleteEmail(selectedEmail.id);
          }
          break;
        case 'Escape':
          if (isComposing) {
            setIsComposing(false);
            if (isMobile) setShowEmailList(true);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedEmail, isComposing, emails, isMobile]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key) {
        case 'c':
          if (event.ctrlKey || event.metaKey) return; // Allow Ctrl+C
          handleCompose();
          break;
        case 'r':
          if (selectedEmail && !isComposing) {
            handleReply();
          }
          break;
        case 'f':
          if (selectedEmail && !isComposing) {
            handleForward();
          }
          break;
        case 'a':
          if (selectedEmail && !isComposing) {
            handleArchiveEmail(selectedEmail.id);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedEmail && !isComposing) {
            handleDeleteEmail(selectedEmail.id);
          }
          break;
        case 'Escape':
          if (isComposing) {
            setIsComposing(false);
            if (isMobile) setShowEmailList(true);
          }
          break;
        case 'ArrowUp':
          if (!isComposing && emails.length > 0) {
            event.preventDefault();
            const currentIndex = selectedEmail ? emails.findIndex(e => e.id === selectedEmail.id) : -1;
            const newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
            handleEmailSelect(emails[newIndex]);
          }
          break;
        case 'ArrowDown':
          if (!isComposing && emails.length > 0) {
            event.preventDefault();
            const currentIndex = selectedEmail ? emails.findIndex(e => e.id === selectedEmail.id) : -1;
            const newIndex = currentIndex < emails.length - 1 ? currentIndex + 1 : emails.length - 1;
            handleEmailSelect(emails[newIndex]);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedEmail, isComposing, emails, isMobile]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await refetchEmails();
      toast({
        title: t('email.refreshed', 'Refreshed'),
        description: t('email.emails_refreshed', 'Emails have been refreshed'),
      });
    } catch (error: any) {
      const errorMessage = error.message || t('email.refresh_failed', 'Failed to refresh emails');
      setError(errorMessage);
      toast({
        title: t('common.error', 'Error'),
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEmailSelect = (email: EmailMessage) => {
    setSelectedEmail(email);
    setIsComposing(false);


    if (isMobile) {
      setShowEmailList(false);
    }
  };

  const handleCompose = () => {
    setIsComposing(true);
    setSelectedEmail(null);


    if (isMobile) {
      setShowEmailList(false);
    }
  };

  const handleEmailSent = () => {
    setIsComposing(false);
    refetchEmails();


    if (isMobile) {
      setShowEmailList(true);
    }

    toast({
      title: t('email.sent', 'Email Sent'),
      description: t('email.email_sent_successfully', 'Your email has been sent successfully'),
    });
  };

  const handleBackToList = () => {
    setSelectedEmail(null);
    setIsComposing(false);
    setShowEmailList(true);
  };

  const handleReply = () => {
    setIsComposing(true);

  };

  const handleForward = () => {
    setIsComposing(true);

  };


  const handleMarkAsRead = async (emailId: number, isRead: boolean) => {

    queryClient.setQueryData(['/api/email/messages', channelId, selectedFolder, debouncedSearchQuery], (oldData: any) => {
      if (!oldData) return oldData;

      const updateEmail = (email: any) => {
        if (email.id === emailId) {
          return {
            ...email,
            isRead: isRead,
            readAt: isRead ? new Date().toISOString() : null
          };
        }
        return email;
      };


      if (oldData.pages) {
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            emails: page.emails.map(updateEmail)
          }))
        };
      }


      if (oldData.emails) {
        return {
          ...oldData,
          emails: oldData.emails.map(updateEmail)
        };
      }

      return oldData;
    });

    try {
      await fetch(`/api/email/messages/${emailId}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead })
      });

    } catch (error) {

      queryClient.invalidateQueries({
        queryKey: ['/api/email/messages'],
        exact: false
      });
      toast({
        title: t('common.error', 'Error'),
        description: t('email.mark_read_failed', 'Failed to update read status'),
        variant: 'destructive'
      });
    }
  };

  const handleStarEmail = async (emailId: number, starred: boolean) => {


    queryClient.setQueryData(['/api/email/messages', channelId, selectedFolder, debouncedSearchQuery], (oldData: any) => {
      if (!oldData) return oldData;

      const updateEmail = (email: any) => {
        if (email.id === emailId) {
          return {
            ...email,
            metadata: {
              ...email.metadata,
              starred: starred
            }
          };
        }
        return email;
      };


      if (oldData.pages) {
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            emails: page.emails.map(updateEmail)
          }))
        };
      }


      if (oldData.emails) {
        return {
          ...oldData,
          emails: oldData.emails.map(updateEmail)
        };
      }

      return oldData;
    });

    try {
      await fetch(`/api/email/messages/${emailId}/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred })
      });

    } catch (error) {

      queryClient.invalidateQueries({
        queryKey: ['/api/email/messages'],
        exact: false
      });
      toast({
        title: t('common.error', 'Error'),
        description: t('email.star_failed', 'Failed to update star status'),
        variant: 'destructive'
      });
    }
  };

  const handleArchiveEmail = async (emailId: number) => {

    const currentEmail = emails.find(email => email.id === emailId);
    const newArchivedStatus = !currentEmail?.metadata?.archived;


    queryClient.setQueryData(['/api/email/messages', channelId, selectedFolder, debouncedSearchQuery], (oldData: any) => {
      if (!oldData) return oldData;

      const updateEmail = (email: any) => {
        if (email.id === emailId) {
          return {
            ...email,
            metadata: {
              ...email.metadata,
              archived: newArchivedStatus
            }
          };
        }
        return email;
      };


      if (oldData.pages) {
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            emails: page.emails.map(updateEmail)
          }))
        };
      }


      if (oldData.emails) {
        return {
          ...oldData,
          emails: oldData.emails.map(updateEmail)
        };
      }

      return oldData;
    });

    try {
      const response = await fetch(`/api/email/messages/${emailId}/archive`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to toggle archive status');
      }

      const data = await response.json();
      const isArchived = data.archived;


      toast({
        title: isArchived ? t('email.archived', 'Email Archived') : t('email.unarchived', 'Email Unarchived'),
        description: isArchived
          ? t('email.email_archived_successfully', 'Email has been archived')
          : t('email.email_unarchived_successfully', 'Email has been unarchived'),
      });
    } catch (error) {

      queryClient.invalidateQueries({
        queryKey: ['/api/email/messages'],
        exact: false
      });
      toast({
        title: t('common.error', 'Error'),
        description: t('email.archive_failed', 'Failed to update archive status'),
        variant: 'destructive'
      });
    }
  };

  const handleDeleteEmail = async (emailId: number) => {
    try {
      await fetch(`/api/email/messages/${emailId}`, {
        method: 'DELETE'
      });
      refetchEmails();
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
        if (isMobile) setShowEmailList(true);
      }
      toast({
        title: t('email.deleted', 'Email Deleted'),
        description: t('email.email_deleted_successfully', 'Email has been deleted'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('email.delete_failed', 'Failed to delete email'),
        variant: 'destructive'
      });
    }
  };

  const handleRestoreEmail = async (emailId: number) => {
    try {

      const response = await fetch(`/api/email/messages/${emailId}/restore`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to restore email');
      }

      refetchEmails();
      toast({
        title: t('email.restored', 'Email Restored'),
        description: t('email.email_restored_successfully', 'Email has been restored to inbox'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('email.restore_failed', 'Failed to restore email'),
        variant: 'destructive'
      });
    }
  };

  const handlePermanentDelete = async (emailId: number) => {
    try {
      const response = await fetch(`/api/email/messages/${emailId}/permanent-delete`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to permanently delete email');
      }

      refetchEmails();
      toast({
        title: t('email.permanently_deleted', 'Email Permanently Deleted'),
        description: t('email.email_permanently_deleted_successfully', 'Email has been permanently deleted'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('email.permanent_delete_failed', 'Failed to permanently delete email'),
        variant: 'destructive'
      });
    }
  };

  if (!channelConnection) {
    return (
      <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-gray-800">
        <Header />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">{t('common.loading', 'Loading...')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }


  if (error) {
    return (
      <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-gray-800">
        <Header />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md mx-auto p-6">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t('email.error_title', 'Email Error')}
              </h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button data-tour="pages-emailinterface.button.common.retry"
                variant="brand"
                onClick={() => {
                  setError(null);
                  handleRefresh();
                }}
              >
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-gray-800">
      <Header />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Email Interface Content */}
        <div className="flex-1 flex bg-gray-50 relative">
          {/* Mobile Back Button */}
          {isMobile && (selectedEmail || isComposing) && (
            <div className="absolute top-4 left-4 z-10">
              <Button data-tour="pages-emailinterface.button.common.back"
                variant="ghost"
                size="sm"
                onClick={handleBackToList}
                className="bg-white shadow-md"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common.back', 'Back')}
              </Button>
            </div>
          )}

          {/* Email Sidebar */}
          <div className={cn(
            "bg-white border-r border-gray-200 flex flex-col transition-all duration-300",
            isMobile ? (showEmailSidebar ? "w-full" : "hidden") : "w-64",
            isTablet ? (showEmailSidebar ? "w-64" : "hidden") : ""
          )}>
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h1 data-tour="pages-emailinterface.h1.email.email" className="text-lg font-semibold text-gray-900">
                  {channelConnection.accountName || t('email.email', 'Email')}
                </h1>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                  {(isMobile || isTablet) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowEmailSidebar(false)}
                    >
                      <Menu className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <Button data-tour="pages-emailinterface.button.email.compose"
                onClick={handleCompose}
                variant="brand"
                className="w-full btn-brand-primary touch-manipulation min-h-[44px]"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('email.compose', 'Compose')}
              </Button>
            </div>

            <EmailSidebar
              folders={folders}
              selectedFolder={selectedFolder}
              onFolderSelect={setSelectedFolder}
            />
          </div>

          {/* Main Content Area */}
          <div className={cn(
            "flex-1 flex",
            isMobile && !showEmailList ? "w-full" : ""
          )}>
            {/* Email List */}
            <div className={cn(
              "bg-white border-r border-gray-200 flex flex-col transition-all duration-300",
              "h-full overflow-hidden", // Ensure proper height constraints
              isMobile ? (showEmailList ? "w-full" : "hidden") : "w-96",
              isTablet ? "w-80" : ""
            )}>
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-gray-700">
                    {selectedFolder.charAt(0).toUpperCase() + selectedFolder.slice(1)}
                  </h2>
                  {(isMobile || isTablet) && !showEmailSidebar && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowEmailSidebar(true)}
                    >
                      <Menu className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input data-tour="pages-emailinterface.input.email.search_emails"
                    placeholder={t('email.search_emails', 'Search emails...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 touch-manipulation"
                  />
                </div>
              </div>

              <EmailList
                emails={emails}
                selectedEmail={selectedEmail}
                onEmailSelect={handleEmailSelect}
                isLoading={isLoadingEmails}
                onLoadMore={loadMoreEmails}
                hasMore={hasMoreEmails}
                isLoadingMore={isFetchingNextPage || isLoadingMore}
                onMarkAsRead={handleMarkAsRead}
                onStarEmail={handleStarEmail}
                onArchiveEmail={handleArchiveEmail}
                onDeleteEmail={handleDeleteEmail}
                onRestoreEmail={handleRestoreEmail}
                onPermanentDelete={handlePermanentDelete}
                currentFolder={selectedFolder}
              />
            </div>

        {/* Email Content */}
        <div className="flex-1 bg-white">
          {isComposing ? (
            <EmailComposer
              channelId={parseInt(channelId || '0')}
              onEmailSent={handleEmailSent}
              onCancel={() => setIsComposing(false)}
              replyTo={selectedEmail}
              forwardFrom={selectedEmail}
            />
          ) : selectedEmail ? (
            <EmailViewer
              email={selectedEmail}
              channelId={parseInt(channelId || '0')}
              onReply={handleReply}
              onForward={handleForward}
              onMarkAsRead={handleMarkAsRead}
              onStarEmail={handleStarEmail}
              onArchiveEmail={handleArchiveEmail}
              onDeleteEmail={handleDeleteEmail}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <div className="text-6xl mb-4">📧</div>
                <h3 className="text-lg font-medium mb-2">
                  {t('email.no_email_selected', 'No email selected')}
                </h3>
                <p className="text-sm">
                  {t('email.select_email_to_view', 'Select an email from the list to view its contents')}
                </p>
              </div>
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
