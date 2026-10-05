import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Eye, EyeOff, Globe, Calendar, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions, PermissionGate } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { PageEditor } from './PageEditor';
import { PagePreview } from './PagePreview';
import { DeleteConfirmDialog } from '../ui/delete-confirm-dialog';

interface CompanyPage {
  id: number;
  companyId: number;
  title: string;
  slug: string;
  content: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  isPublished: boolean;
  isFeatured: boolean;
  template: string;
  customCss?: string;
  customJs?: string;
  authorId?: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function PagesManagement() {
  const [showEditor, setShowEditor] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingPage, setEditingPage] = useState<CompanyPage | null>(null);
  const [previewPage, setPreviewPage] = useState<CompanyPage | null>(null);
  const [deletePageId, setDeletePageId] = useState<number | null>(null);
  
  const { toast } = useToast();
  const { company } = useAuth();
  const { PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: pages = [], isLoading, refetch } = useQuery<CompanyPage[]>({
    queryKey: ['/api/company-pages'],
    refetchOnWindowFocus: false
  });

  const createPageMutation = useMutation({
    mutationFn: async (pageData: Partial<CompanyPage>) => {
      const res = await apiRequest('POST', '/api/company-pages', pageData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pages.created_success', 'Page created successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company-pages'] });
      setShowEditor(false);
      setEditingPage(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.create_error', 'Failed to create page') + `: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const updatePageMutation = useMutation({
    mutationFn: async ({ id, ...pageData }: Partial<CompanyPage> & { id: number }) => {
      const res = await apiRequest('PUT', `/api/company-pages/${id}`, pageData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pages.updated_success', 'Page updated successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company-pages'] });
      setShowEditor(false);
      setEditingPage(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.update_error', 'Failed to update page') + `: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/company-pages/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pages.deleted_success', 'Page deleted successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company-pages'] });
      setDeletePageId(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.delete_error', 'Failed to delete page') + `: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, publish }: { id: number; publish: boolean }) => {
      const endpoint = publish ? 'publish' : 'unpublish';
      const res = await apiRequest('POST', `/api/company-pages/${id}/${endpoint}`);
      return await res.json();
    },
    onSuccess: (_, { publish }) => {
      toast({
        title: t('common.success', 'Success'),
        description: publish ? t('pages.publish_success', 'Page published successfully') : t('pages.unpublish_success', 'Page unpublished successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company-pages'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.update_error', 'Failed to update page') + `: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const handleCreatePage = () => {
    setEditingPage(null);
    setShowEditor(true);
  };

  const handleEditPage = (page: CompanyPage) => {
    setEditingPage(page);
    setShowEditor(true);
  };

  const handlePreviewPage = (page: CompanyPage) => {
    setPreviewPage(page);
    setShowPreview(true);
  };

  const handleSavePage = (pageData: Partial<CompanyPage>) => {
    if (editingPage) {
      updatePageMutation.mutate({ ...pageData, id: editingPage.id });
    } else {
      createPageMutation.mutate(pageData);
    }
  };

  const handleDeletePage = (id: number) => {
    setDeletePageId(id);
  };

  const confirmDeletePage = () => {
    if (deletePageId) {
      deletePageMutation.mutate(deletePageId);
    }
  };

  const handleTogglePublish = (page: CompanyPage) => {
    togglePublishMutation.mutate({ id: page.id, publish: !page.isPublished });
  };

  const getPublicUrl = (page: CompanyPage) => {
    if (typeof window === 'undefined') {
      return '';
    }
    const companySlug = (company as any)?.subdomain || company?.slug;
    if (!companySlug) {
      return '';
    }
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port;
    const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
    return `${protocol}//${hostname}${portSuffix}/${companySlug}-${page.slug}`;
  };

  if (showEditor) {
    return (
      <PageEditor
        page={editingPage}
        onSave={handleSavePage}
        onCancel={() => {
          setShowEditor(false);
          setEditingPage(null);
        }}
        isLoading={createPageMutation.isPending || updatePageMutation.isPending}
      />
    );
  }

  if (showPreview && previewPage) {
    return (
      <PagePreview
        page={previewPage}
        onClose={() => {
          setShowPreview(false);
          setPreviewPage(null);
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const publishedPages = pages.filter(page => page.isPublished).length;
  const draftPages = pages.filter(page => !page.isPublished).length;
  const featuredPages = pages.filter(page => page.isFeatured).length;

  return (
    <div className="space-y-6">
      {/* Header Section - Following CampaignDashboard pattern */}
      <div className="flex justify-between items-center">
        <div>
          <h1 data-tour="components-pages-pagesmanagement.h1.nav.pages" className="text-2xl text-foreground">{t('nav.pages', 'Pages Management')}</h1>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground">
              {t('pages.dashboard_description', 'Create and manage public-facing pages for your company')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permissions={[PERMISSIONS.MANAGE_PAGES]}>
            <Button data-tour="components-pages-pagesmanagement.button.pages.create" onClick={handleCreatePage} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('pages.create', 'Create Page')}
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* Stats Cards - Following CampaignDashboard pattern */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('pages.total_pages', 'Total Pages')}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{pages.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('pages.published_pages', 'Published Pages')}</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{publishedPages}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('pages.draft_pages', 'Draft Pages')}</CardTitle>
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{draftPages}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('pages.featured_pages', 'Featured Pages')}</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{featuredPages}</div>
          </CardContent>
        </Card>
      </div>

      {/* Pages List */}
      {pages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t('pages.empty.title', 'No pages created yet')}
            </h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              {t('pages.empty.description', 'Create your first page to start building your public-facing content like Terms of Service, Privacy Policy, or custom pages.')}
            </p>
            <PermissionGate permissions={[PERMISSIONS.MANAGE_PAGES]}>
              <Button data-tour="components-pages-pagesmanagement.button.pages.create" onClick={handleCreatePage}>
                <Plus className="w-4 h-4 mr-2" />
                {t('pages.create', 'Create Page')}
              </Button>
            </PermissionGate>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pages.map((page) => (
            <Card key={page.id} className="hover:shadow-lg dark:hover:shadow-primary/5 transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg text-foreground">{page.title}</CardTitle>
                    <CardDescription className="mt-1">
                      /{page.slug}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-1">
                    {page.isPublished ? (
                      <Badge variant="default" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-0">
                        <Eye className="w-3 h-3 mr-1" />
                        {t('pages.published', 'Published')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <EyeOff className="w-3 h-3 mr-1" />
                        {t('pages.draft', 'Draft')}
                      </Badge>
                    )}
                    {page.isFeatured && (
                      <Badge  className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800">
                        {t('pages.featured', 'Featured')}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {t('pages.updated', 'Updated')}: {new Date(page.updatedAt).toLocaleDateString()}
                    </div>
                    {page.publishedAt && (
                      <div className="flex items-center mt-1">
                        <Globe className="w-4 h-4 mr-1" />
                        {t('pages.published', 'Published')}: {new Date(page.publishedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {page.isPublished && getPublicUrl(page) && (
                    <div className="text-sm">
                      <a
                        href={getPublicUrl(page)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:opacity-90 underline"
                      >
                        {t('pages.view_public', 'View Public Page')} →
                      </a>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex space-x-2">
                      <Button data-tour="components-pages-pagesmanagement.button.pages.preview"
                        size="sm"
                        onClick={() => handlePreviewPage(page)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        {t('pages.preview', 'Preview')}
                      </Button>
                      <PermissionGate permissions={[PERMISSIONS.MANAGE_PAGES]}>
                        <Button data-tour="components-pages-pagesmanagement.button.pages.edit"
                          size="sm"
                          onClick={() => handleEditPage(page)}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          {t('pages.edit', 'Edit')}
                        </Button>
                      </PermissionGate>
                    </div>
                    <div className="flex space-x-2">
                      <PermissionGate permissions={[PERMISSIONS.MANAGE_PAGES]}>
                        <Button data-tour="components-pages-pagesmanagement.button.pages.unpublish"
                          variant={page.isPublished ? "secondary" : "default"}
                          size="sm"
                          onClick={() => handleTogglePublish(page)}
                          disabled={togglePublishMutation.isPending}
                        >
                          {page.isPublished ? (
                            <>
                              <EyeOff className="w-4 h-4 mr-1" />
                              {t('pages.unpublish', 'Unpublish')}
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4 mr-1" />
                              {t('pages.publish', 'Publish')}
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleDeletePage(page.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </PermissionGate>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DeleteConfirmDialog
        open={deletePageId !== null}
        onOpenChange={(open: boolean) => !open && setDeletePageId(null)}
        onConfirm={confirmDeletePage}
        title={t('pages.delete.title', 'Delete Page')}
        description={t('pages.delete.description', 'Are you sure you want to delete this page? This action cannot be undone and the page will no longer be accessible to the public.')}
        isLoading={deletePageMutation.isPending}
      />
    </div>
  );
}
