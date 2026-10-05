import { useRef, useState } from 'react';
import { ExternalLink, File, Loader2, Upload, X } from 'lucide-react';
import type { CustomFieldFileReference } from '@shared/contact-custom-fields';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';

type Props = {
  ownerType: 'contact' | 'deal';
  ownerId?: number | null;
  value?: CustomFieldFileReference | null;
  pendingFile?: File | null;
  onChange: (value: CustomFieldFileReference | undefined) => void;
  onPendingFileChange?: (file: File | null) => void;
  disabled?: boolean;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
]);

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Translate = (key: string, fallback?: string, variables?: Record<string, any>) => string;

export async function uploadCustomFieldFile(
  ownerType: 'contact' | 'deal',
  ownerId: number,
  file: File,
  t?: Translate,
) {
  const body = new FormData();
  body.append('file', file);
  body.append('ownerType', ownerType);
  body.append('ownerId', String(ownerId));
  const response = await apiRequest('POST', '/api/custom-field-attachments', body);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const serverMessage = typeof json.error === 'string' ? json.error : '';
    if (/too large/i.test(serverMessage)) {
      throw new Error(t?.('custom_fields.file.too_large', 'File too large. Maximum size is 10 MB.') ?? serverMessage);
    }
    if (/invalid file type|only pdf/i.test(serverMessage)) {
      throw new Error(t?.('custom_fields.file.invalid_type', 'Only PDF, JPG, PNG, GIF, Word, and text files are allowed.') ?? serverMessage);
    }
    if (/no file/i.test(serverMessage)) {
      throw new Error(t?.('custom_fields.file.no_file', 'Select a file to upload.') ?? serverMessage);
    }
    throw new Error(t?.('custom_fields.file.upload_failed', 'Failed to upload file') ?? (serverMessage || 'Failed to upload file'));
  }
  return json.data as CustomFieldFileReference;
}

export function CustomFieldFileSelect({
  ownerType,
  ownerId,
  value,
  pendingFile,
  onChange,
  onPendingFileChange,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseLocalFile = async (file: File | null) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError(t('custom_fields.file.too_large', 'File too large. Maximum size is 10 MB.'));
      return;
    }
    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      setError(t('custom_fields.file.invalid_type', 'Only PDF, JPG, PNG, GIF, Word, and text files are allowed.'));
      return;
    }
    if (!ownerId) {
      onPendingFileChange?.(file);
      onChange(undefined);
      return;
    }
    try {
      setUploading(true);
      onChange(await uploadCustomFieldFile(ownerType, ownerId, file, t));
    } catch (uploadError) {
      setError(uploadError instanceof Error
        ? uploadError.message
        : t('custom_fields.file.upload_failed', 'Failed to upload file'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const selectedName = pendingFile?.name || value?.name;
  const selectedSize = pendingFile?.size ?? value?.size;

  return (
    <div className="space-y-2">
      <input data-tour="components-contacts-customfieldfileselect.input.custom_fields.file.open"
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.txt"
        disabled={disabled || uploading}
        onChange={(event) => void chooseLocalFile(event.target.files?.[0] ?? null)}
      />
      {selectedName ? (
        <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          {value?.url ? (
            <a
              className="min-w-0 flex-1 truncate text-primary hover:underline"
              href={value.url}
              target="_blank"
              rel="noreferrer"
              title={t('custom_fields.file.open', 'Open {{name}}', { name: selectedName })}
            >
              {selectedName}
            </a>
          ) : <span className="min-w-0 flex-1 truncate">{selectedName}</span>}
          {selectedSize != null ? <span className="text-xs text-muted-foreground">{formatBytes(selectedSize)}</span> : null}
          {value?.url ? <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> : null}
          {!disabled ? (
            <Button data-tour="components-contacts-customfieldfileselect.button.custom_fields.file.remove"
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={t('custom_fields.file.remove', 'Remove file')}
              aria-label={t('custom_fields.file.remove', 'Remove file')}
              onClick={() => { onChange(undefined); onPendingFileChange?.(null); }}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <Button data-tour="components-contacts-customfieldfileselect.button.custom_fields.file.replace" type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {selectedName
              ? t('custom_fields.file.replace', 'Replace file')
              : t('custom_fields.file.upload', 'Upload file')}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
