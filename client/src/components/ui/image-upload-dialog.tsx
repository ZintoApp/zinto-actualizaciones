import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Link, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

export type ImageUploadInsertResult = {
  url: string;
  altText?: string;
  title?: string;
  rawResponse?: unknown;
};

export type ParseImageUploadResponse = (response: unknown) => {
  success: boolean;
  url?: string;
  altText?: string;
  title?: string;
  error?: string;
  rawResponse?: unknown;
};

export const DEFAULT_IMAGE_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

interface ImageUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImageInsert: (imageUrl: string, altText?: string) => void;
  onUploadComplete?: (result: ImageUploadInsertResult) => void;
  uploadUrl?: string;
  allowUrlInput?: boolean;
  parseUploadResponse?: ParseImageUploadResponse;
  allowedMimeTypes?: readonly string[];
  supportedFormatsHint?: string;
  submitMetadata?: boolean;
}

function isAllowedUploadFile(file: File, allowedTypes: readonly string[]): boolean {
  if (allowedTypes.includes(file.type)) {
    return true;
  }

  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  const extensionToMime: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const inferredType = extensionToMime[ext];
  return inferredType ? allowedTypes.includes(inferredType) : false;
}

interface CompanyPagesUploadResponse {
  success: boolean;
  data?: {
    url: string;
    filename: string;
    size: number;
    mimetype: string;
  };
  error?: string;
  message?: string;
}

function parseCompanyPagesUploadResponse(response: unknown): ReturnType<ParseImageUploadResponse> {
  const parsed = response as CompanyPagesUploadResponse;
  if (parsed.success && parsed.data?.url) {
    return {
      success: true,
      url: parsed.data.url,
      rawResponse: response,
    };
  }

  return {
    success: false,
    error: parsed.message || parsed.error || 'Upload failed',
    rawResponse: response,
  };
}

export function ImageUploadDialog({
  isOpen,
  onClose,
  onImageInsert,
  onUploadComplete,
  uploadUrl = '/api/company-pages/upload-media',
  allowUrlInput = true,
  parseUploadResponse = parseCompanyPagesUploadResponse,
  allowedMimeTypes = DEFAULT_IMAGE_UPLOAD_MIME_TYPES,
  supportedFormatsHint,
  submitMetadata = false,
}: ImageUploadDialogProps) {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imageUrl, setImageUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const formatsHint =
    supportedFormatsHint ??
    t('ui.imageUpload.supportedFormats', 'Supported formats: JPEG, PNG, GIF, WebP (max 10MB)');

  useEffect(() => {
    if (!isOpen) {

      setSelectedFile(null);
      setPreviewUrl(null);
      setImageUrl('');
      setAltText('');
      setTitle('');
      setError(null);
      setIsUploading(false);
      setUploadProgress(0);
      setActiveTab('upload');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!allowUrlInput && activeTab === 'url') {
      setActiveTab('upload');
    }
  }, [activeTab, allowUrlInput]);

  useEffect(() => {

    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);


    if (!isAllowedUploadFile(file, allowedMimeTypes)) {
      setError(
        t(
          'ui.imageUpload.errors.invalidFileType',
          'Please select a valid image file (JPEG, PNG, GIF, or WebP)'
        )
      );
      return;
    }


    if (file.size > MAX_FILE_SIZE) {
      setError(t('ui.imageUpload.errors.maxSize', 'File size must be less than 10MB'));
      return;
    }

    const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '');
    setSelectedFile(file);
    setAltText(nameWithoutExtension);
    if (submitMetadata) {
      setTitle(nameWithoutExtension);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (submitMetadata) {
        if (altText.trim()) {
          formData.append('alt', altText.trim());
        }
        if (title.trim()) {
          formData.append('title', title.trim());
        }
      }


      const xhr = new XMLHttpRequest();
      
      const uploadPromise = new Promise<unknown>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            reject(new Error(t('ui.imageUpload.errors.invalidResponse', 'Invalid response format')));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error(t('ui.imageUpload.errors.uploadFailed', 'Upload failed')));
        });

        xhr.open('POST', uploadUrl);
        xhr.send(formData);
      });

      const response = await uploadPromise;
      const parsed = parseUploadResponse(response);

      if (parsed.success && parsed.url) {
        toast({
          title: t('ui.common.success', 'Success'),
          description: t('ui.imageUpload.toast.uploadSuccess', 'Image uploaded successfully'),
        });
        const resolvedAltText = parsed.altText ?? altText;
        const resolvedTitle = parsed.title ?? (submitMetadata ? title : undefined);
        onImageInsert(parsed.url, resolvedAltText);
        onUploadComplete?.({
          url: parsed.url,
          altText: resolvedAltText,
          title: resolvedTitle?.trim() || undefined,
          rawResponse: parsed.rawResponse ?? response,
        });
        onClose();
      } else {
        throw new Error(parsed.error || t('ui.imageUpload.errors.uploadFailed', 'Upload failed'));
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setError(error.message || t('ui.imageUpload.errors.uploadFailedGeneric', 'Failed to upload image'));
      toast({
        title: t('ui.imageUpload.toast.uploadErrorTitle', 'Upload Error'),
        description: error.message || t('ui.imageUpload.errors.uploadFailedGeneric', 'Failed to upload image'),
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUrlInsert = () => {
    if (!imageUrl.trim()) {
      setError(t('ui.imageUpload.errors.invalidImageUrl', 'Please enter a valid image URL'));
      return;
    }


    try {
      new URL(imageUrl);
    } catch {
      setError(t('ui.imageUpload.errors.invalidUrl', 'Please enter a valid URL'));
      return;
    }

    onImageInsert(imageUrl, altText);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" closeButtonLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            {t('ui.imageUpload.title', 'Insert Image')}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      

          <TabsContent value="upload" className="space-y-4">
            <div>
              <Label htmlFor="file-upload">{t('ui.imageUpload.selectFileLabel', 'Select Image File')}</Label>
              <input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept={allowedMimeTypes.join(',')}
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full mt-2"
                disabled={isUploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('ui.imageUpload.chooseFile', 'Choose File')}
              </Button>
              <p className="text-sm text-muted-foreground mt-1">{formatsHint}</p>
            </div>

            {selectedFile && (
              <div className="space-y-3">
                <div className="text-sm">
                  <p><strong>{t('ui.imageUpload.file', 'File')}:</strong> {selectedFile.name}</p>
                  <p><strong>{t('ui.imageUpload.size', 'Size')}:</strong> {formatFileSize(selectedFile.size)}</p>
                  <p><strong>{t('ui.imageUpload.type', 'Type')}:</strong> {selectedFile.type}</p>
                </div>

                {previewUrl && (
                  <div className="border rounded-lg p-2">
                    <img
                      src={previewUrl}
                      alt={t('ui.imageUpload.previewAlt', 'Preview')}
                      className="max-w-full max-h-48 mx-auto rounded"
                    />
                  </div>
                )}

                {submitMetadata && (
                  <div>
                    <Label htmlFor="asset-title">{t('ui.imageUpload.titleOptional', 'Title (Optional)')}</Label>
                    <Input
                      id="asset-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('ui.imageUpload.titlePlaceholder', 'Display title for this asset...')}
                      disabled={isUploading}
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="alt-text">{t('ui.imageUpload.altTextOptional', 'Alt Text (Optional)')}</Label>
                  <Input
                    id="alt-text"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder={t('ui.imageUpload.altTextPlaceholder', 'Describe the image...')}
                    disabled={isUploading}
                  />
                </div>

                {isUploading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{t('ui.imageUpload.uploading', 'Uploading...')}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="w-full" />
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {allowUrlInput && (
            <TabsContent value="url" className="space-y-4">
              <div>
                <Label htmlFor="image-url">{t('ui.imageUpload.imageUrl', 'Image URL')}</Label>
                <Input
                  id="image-url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder={t('ui.imageUpload.imageUrlPlaceholder', 'https://example.com/image.jpg')}
                />
              </div>

              <div>
                <Label htmlFor="alt-text-url">{t('ui.imageUpload.altTextOptional', 'Alt Text (Optional)')}</Label>
                <Input
                  id="alt-text-url"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder={t('ui.imageUpload.altTextPlaceholder', 'Describe the image...')}
                />
              </div>

              {imageUrl && (
                <div className="border rounded-lg p-2">
                  <img
                    src={imageUrl}
                    alt={t('ui.imageUpload.previewAlt', 'Preview')}
                    className="max-w-full max-h-48 mx-auto rounded"
                    onError={() => setError(t('ui.imageUpload.errors.previewLoadFailed', 'Failed to load image from URL'))}
                  />
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUploading}>
            {t('ui.common.cancel', 'Cancel')}
          </Button>
          {activeTab === 'upload' ? (
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? t('ui.imageUpload.uploading', 'Uploading...') : t('ui.imageUpload.uploadAndInsert', 'Upload & Insert')}
            </Button>
          ) : (
            <Button
              onClick={handleUrlInsert}
              disabled={!imageUrl.trim()}
            >
              {t('ui.imageUpload.insertImage', 'Insert Image')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
