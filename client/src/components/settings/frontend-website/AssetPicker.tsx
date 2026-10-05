import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImageUploadDialog } from '@/components/ui/image-upload-dialog';
import { useTranslation } from '@/hooks/use-translation';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import type { FrontendWebsiteMediaAsset, FrontendWebsiteMediaLibrary } from '@shared/frontend-website-settings';
import {
  FRONTEND_WEBSITE_ALLOWED_MIME_TYPES,
  FRONTEND_WEBSITE_MEDIA_UPLOAD_URL,
  FRONTEND_WEBSITE_SUPPORTED_FORMATS_HINT,
  extractUploadedAsset,
  parseFrontendWebsiteUploadResponse,
} from './helpers';

type AssetPickerProps = {
  label: string;
  assetId?: string;
  mediaLibrary: FrontendWebsiteMediaLibrary;
  onSelect: (assetId: string | undefined) => void;
  onLibraryUpdated: (library: FrontendWebsiteMediaLibrary) => void;
  usageLabels?: string[];
  error?: string;
};

export function AssetPicker({
  label,
  assetId,
  mediaLibrary,
  onSelect,
  onLibraryUpdated,
  usageLabels,
  error,
}: AssetPickerProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const selectedAsset = mediaLibrary.assets.find((asset) => asset.id === assetId);

  const handleUploaded = (rawResponse: unknown) => {
    const asset = extractUploadedAsset(rawResponse);
    const parsed = rawResponse as { mediaLibrary?: FrontendWebsiteMediaLibrary };
    if (parsed.mediaLibrary) {
      onLibraryUpdated(parsed.mediaLibrary);
    }
    if (asset) {
      onSelect(asset.id);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex gap-2">
          <Button data-tour="components-settings-frontend-website-assetpicker.button.admin.settings.frontend_website.select_asset" type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            {t('admin.settings.frontend_website.select_asset', 'Select')}
          </Button>
          <Button data-tour="components-settings-frontend-website-assetpicker.button.admin.settings.frontend_website.upload_asset" type="button" variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            {t('admin.settings.frontend_website.upload_asset', 'Upload')}
          </Button>
          {assetId && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(undefined)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {selectedAsset ? (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          {selectedAsset.mimeType.startsWith('image/') ? (
            <img src={selectedAsset.url} alt={selectedAsset.alt || selectedAsset.originalName} className="h-12 w-12 rounded object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectedAsset.originalName}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedAsset.id}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('admin.settings.frontend_website.no_asset_selected', 'No asset selected')}
        </p>
      )}

      {usageLabels && usageLabels.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('admin.settings.frontend_website.used_by', 'Used by')}: {usageLabels.join(', ')}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
            {mediaLibrary.assets.map((asset) => (
              <AssetGridItem
                key={asset.id}
                asset={asset}
                selected={asset.id === assetId}
                onSelect={() => {
                  onSelect(asset.id);
                  setPickerOpen(false);
                }}
              />
            ))}
          </div>
          {mediaLibrary.assets.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('admin.settings.frontend_website.media_empty', 'No media assets yet. Upload one to get started.')}
            </p>
          )}
          <DialogFooter>
            <Button data-tour="components-settings-frontend-website-assetpicker.button.ui.common.close" type="button" variant="outline" onClick={() => setPickerOpen(false)}>
              {t('ui.common.close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

function AssetGridItem({
  asset,
  selected,
  onSelect,
}: {
  asset: FrontendWebsiteMediaAsset;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border p-2 text-left transition-colors hover:bg-muted/50 ${selected ? 'border-primary ring-2 ring-primary/30' : ''}`}
    >
      {asset.mimeType.startsWith('image/') ? (
        <img src={asset.url} alt={asset.alt || asset.originalName} className="mb-2 h-20 w-full rounded object-cover" />
      ) : (
        <div className="mb-2 flex h-20 w-full items-center justify-center rounded bg-muted">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <p className="truncate text-xs font-medium">{asset.originalName}</p>
    </button>
  );
}
