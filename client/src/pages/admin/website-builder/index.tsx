import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Eye, Globe, FileText, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import AdminLayout from '@/components/admin/AdminLayout';

interface Website {
  id: number;
  title: string;
  slug: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function WebsiteBuilderIndex() {
  const { toast } = useToast();
  const queryClient = useQueryClient();


  const { data: websites, isLoading, error } = useQuery<Website[]>({
    queryKey: ['admin-websites'],
    queryFn: async () => {
      const response = await fetch('/api/admin/websites');
      if (!response.ok) {
        throw new Error('Failed to fetch websites');
      }
      return response.json();
    }
  });


  const deleteWebsiteMutation = useMutation({
    mutationFn: async (websiteId: number) => {
      const response = await fetch(`/api/admin/websites/${websiteId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete website');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-websites'] });
      toast({
        title: 'Success',
        description: 'Website deleted successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete website',
        variant: 'destructive'
      });
    }
  });


  const togglePublishMutation = useMutation({
    mutationFn: async ({ websiteId, action }: { websiteId: number; action: 'publish' | 'unpublish' }) => {
      const response = await fetch(`/api/admin/websites/${websiteId}/${action}`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to ${action} website`);
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-websites'] });
      toast({
        title: 'Success',
        description: `Website ${variables.action}ed successfully`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update website status',
        variant: 'destructive'
      });
    }
  });

  const handleDelete = (websiteId: number, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      deleteWebsiteMutation.mutate(websiteId);
    }
  };

  const handleTogglePublish = (websiteId: number, currentStatus: string) => {
    const action = currentStatus === 'published' ? 'unpublish' : 'publish';
    togglePublishMutation.mutate({ websiteId, action });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-100 text-green-800">Published</Badge>;
      case 'draft':
        return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>;
      case 'archived':
        return <Badge className="bg-gray-100 text-gray-800">Archived</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Website Builder</h1>
              <p className="text-gray-600">Manage your website pages and templates</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Websites</h2>
            <p className="text-gray-600 mb-4">Failed to load websites. Please try again.</p>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-websites'] })}>
              Retry
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Website Builder</h1>
          <p className="text-gray-600">Manage your website pages</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/website-builder/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Website
            </Button>
          </Link>
        </div>
      </div>

      {websites && websites.length === 0 ? (
        <div className="text-center py-12">
          <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Websites Yet</h2>
          <p className="text-gray-600 mb-6">Create your first website to get started.</p>
          <Link href="/admin/website-builder/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Website
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {websites?.map((website) => (
            <Card key={website.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{website.title}</CardTitle>
                    <CardDescription className="mt-1">
                      /{website.slug}
                    </CardDescription>
                  </div>
                  {getStatusBadge(website.status)}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {website.description || 'No description provided'}
                </p>
                
                <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                  <span>Created: {new Date(website.createdAt).toLocaleDateString()}</span>
                  {website.publishedAt && (
                    <span>Published: {new Date(website.publishedAt).toLocaleDateString()}</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Link href={`/admin/website-builder/edit/${website.id}`}>
                    <Button size="sm" variant="outline" className="flex-1">
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </Link>
                  
                  {website.status === 'published' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/${website.slug}`, '_blank')}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant={website.status === 'published' ? 'secondary' : 'default'}
                    onClick={() => handleTogglePublish(website.id, website.status)}
                    disabled={togglePublishMutation.isPending}
                    className={website.status === 'published' ? 'bg-green-100 text-green-800 hover:bg-green-200' : ''}
                  >
                    {website.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(website.id, website.title)}
                    disabled={deleteWebsiteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </AdminLayout>
  );
}
