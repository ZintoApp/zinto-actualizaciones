import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUploadDialog } from '@/components/ui/image-upload-dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Trash2, Upload } from 'lucide-react';
import type { FrontendWebsiteMediaLibrary } from '@shared/frontend-website-settings';
import {
  FRONTEND_WEBSITE_ALLOWED_MIME_TYPES,
  FRONTEND_WEBSITE_MEDIA_UPLOAD_URL,
  FRONTEND_WEBSITE_SETTINGS_QUERY_KEY,
  FRONTEND_WEBSITE_SUPPORTED_FORMATS_HINT,
  extractUploadedAsset,
  getAssetUsageMap,
  parseFrontendWebsiteUploadResponse,
} from './helpers';
import type { FrontendWebsiteSettings } from '@shared/frontend-website-settings';

type MediaLibraryPanelProps = {
  mediaLibrary: FrontendWebsiteMediaLibrary;
  websiteDraft: FrontendWebsiteSettings;
  onLibraryUpdated: (library: FrontendWebsiteMediaLibrary) => void;
};

export function MediaLibraryPanel({
  mediaLibrary,
  websiteDraft,
  onLibraryUpdated,
}: MediaLibraryPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const usageMap = getAssetUsageMap(websiteDraft, mediaLibrary);

  const deleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await apiRequest('DELETE', `/api/admin/settings/frontend-website/media/${assetId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete asset');
      }
      return res.json() as Promise<{ mediaLibrary: FrontendWebsiteMediaLibrary }>;
    },
    onSuccess: (data) => {
      onLibraryUpdated(data.mediaLibrary);
      queryClient.invalidateQueries({ queryKey: FRONTEND_WEBSITE_SETTINGS_QUERY_KEY });
      toast({
        title: t('ui.common.success', 'Success'),
        description: t('admin.settings.frontend_website.media_deleted', 'Media asset deleted'),
      });
    },
    onError: (error: Error) => {
      const message = error.message.includes('referenced')
        ? t(
            'admin.settings.frontend_website.media_in_use',
            'This asset is still in use by website settings. Remove references before deleting.'
          )
        : error.message;
      toast({
        title: t('ui.common.error', 'Error'),
        description: message,
        variant: 'destructive',
      });
    },
  });

  const handleUploaded = (rawResponse: unknown) => {
    const parsed = rawResponse as { mediaLibrary?: FrontendWebsiteMediaLibrary };
    if (parsed.mediaLibrary) {
      onLibraryUpdated(parsed.mediaLibrary);
    } else {
      const asset = extractUploadedAsset(rawResponse);
      if (asset) {
        onLibraryUpdated({
          ...mediaLibrary,
          assets: [...mediaLibrary.assets, asset],
        });
      }
    }
    queryClient.invalidateQueries({ queryKey: FRONTEND_WEBSITE_SETTINGS_QUERY_KEY });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t('admin.settings.frontend_website.media_title', 'Media Library')}</CardTitle>
            <CardDescription>
              {t(
                'admin.settings.frontend_website.media_description',
                'Upload and manage assets used by the public website header, hero, and SEO fields.'
              )}
            </CardDescription>
          </div>
          <Button data-tour="components-settings-frontend-website-medialibrarypanel.button.admin.settings.frontend_website.upload_asset" type="button" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t('admin.settings.frontend_website.upload_asset', 'Upload')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mediaLibrary.assets.map((asset) => {
            const usage = usageMap.get(asset.id) ?? [];
            return (
              <div key={asset.id} className="rounded-lg border p-3">
                {asset.mimeType.startsWith('image/') ? (
                  <img
                    src={asset.url}
                    alt={asset.alt || asset.originalName}
                    className="mb-3 h-36 w-full rounded object-cover"
                  />
                ) : (
                  <div className="mb-3 flex h-36 w-full items-center justify-center rounded bg-muted text-sm text-muted-foreground">
                    {asset.assetType}
                  </div>
                )}
                <div className="space-y-1">
                  <p className="truncate text-sm font-medium">{asset.originalName}</p>
                  <p className="truncate text-xs text-muted-foreground">{asset.mimeType}</p>
                  <p className="truncate text-xs text-muted-foreground">{asset.id}</p>
                  {usage.length > 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {t('admin.settings.frontend_website.used_by', 'Used by')}: {usage.join(', ')}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.frontend_website.unused_asset', 'Not currently referenced')}
                    </p>
                  )}
                </div>
                <Button data-tour="components-settings-frontend-website-medialibrarypanel.button.ui.common.delete"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(asset.id)}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {t('ui.common.delete', 'Delete')}
                </Button>
              </div>
            );
          })}
        </div>

        {mediaLibrary.assets.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t('admin.settings.frontend_website.media_empty', 'No media assets yet. Upload one to get started.')}
          </p>
        )}
      </CardContent>

      <ImageUploadDialog
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onImageInsert={() => {}}
        onUploadComplete={(result) => handleUploaded(result.rawResponse)}
        uploadUrl={FRONTEND_WEBSITE_MEDIA_UPLOAD_URL}
        allowUrlInput={false}
        parseUploadResponse={parseFrontendWebsiteUploadResponse}
        allowedMimeTypes={FRONTEND_WEBSITE_ALLOWED_MIME_TYPES}
        supportedFormatsHint={FRONTEND_WEBSITE_SUPPORTED_FORMATS_HINT}
        submitMetadata
      />
    </Card>
  );
}
