import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import type { DownloadExportFormat } from '@/lib/download-export';

interface ExportFormatMenuProps {
  onExport: (format: DownloadExportFormat) => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  hideLabel?: boolean;
}

export function ExportFormatMenu({
  onExport,
  disabled = false,
  loading = false,
  label,
  className,
  size = 'sm',
  variant = 'outline',
  hideLabel = false,
}: ExportFormatMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={disabled || loading}
          className={cn('gap-2', className)}
          aria-label={hideLabel ? (label ?? t('common.export', 'Export')) : undefined}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {!hideLabel && (label ?? t('common.export', 'Export'))}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void onExport('csv')}>
          <FileText className="mr-2 h-4 w-4" />
          {t('common.exportCsv', 'Export as CSV')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void onExport('xlsx')}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {t('common.exportExcel', 'Export as Excel')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ExportFormatMenu;
