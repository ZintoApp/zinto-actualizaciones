import { useTranslation } from '@/hooks/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Calendar, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { mappingToTemplateExpression } from '@shared/whatsapp-template-variables';
import { WhatsAppTemplatePreview } from './WhatsAppTemplatePreview';

interface ViewTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: any;
}

export function ViewTemplateModal({ isOpen, onClose, template }: ViewTemplateModalProps) {
  const { t } = useTranslation();

  if (!template) return null;

  const variableDefinitions = template.whatsappTemplateVariables || (template.variables || []).map((key: string) => ({ id: `body:${key}`, component: 'body', name: key }));
  const variableMappings = template.whatsappTemplateVariableMappings || {};

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t('templates.status.approved', 'Approved')}
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            {t('templates.status.pending', 'Pending')}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            {t('templates.status.rejected', 'Rejected')}
          </Badge>
        );
      case 'disabled':
        return (
          <Badge className="bg-gray-100 text-gray-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {t('templates.status.disabled', 'Disabled')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{t('templates.status.draft', 'Draft')}</Badge>;
    }
  };

  const getCategoryBadge = (category?: string) => {
    switch (category) {
      case 'marketing':
        return <Badge variant="secondary">{t('templates.category.marketing', 'Marketing')}</Badge>;
      case 'utility':
        return <Badge variant="default">{t('templates.category.utility', 'Utility')}</Badge>;
      case 'authentication':
        return <Badge variant="outline">{t('templates.category.authentication', 'Authentication')}</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="custom-scrollbar max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>
            {template.description || t('templates.no_description', 'No description provided')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,.9fr)_minmax(360px,1.1fr)] lg:items-start">
          <div className="min-w-0 space-y-6">
          {/* Status and Category */}
          <div className="flex flex-wrap gap-2">
            {getStatusBadge(template.whatsappTemplateStatus)}
            {getCategoryBadge(template.whatsappTemplateCategory)}
            {template.isActive ? (
              <Badge className="bg-blue-100 text-blue-800">
                {t('templates.active', 'Active')}
              </Badge>
            ) : (
              <Badge variant="outline">{t('templates.inactive', 'Inactive')}</Badge>
            )}
          </div>

          <Separator />

          {/* Template Details */}
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-500">{t('templates.language', 'Language')}</Label>
                <p className="text-sm font-medium uppercase mt-1">
                  {template.whatsappTemplateLanguage || 'en'}
                </p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">{t('templates.table.usage', 'Usage Count')}</Label>
                <p className="text-sm font-medium mt-1">{template.usageCount || 0}</p>
              </div>
            </div>

            {template.whatsappTemplateId && (
              <div>
                <Label className="text-xs text-gray-500">{t('templates.whatsapp_id', 'WhatsApp Template ID')}</Label>
                <p className="text-sm font-mono mt-1">{template.whatsappTemplateId}</p>
              </div>
            )}

            {template.whatsappTemplateName && (
              <div>
                <Label className="text-xs text-gray-500">{t('templates.whatsapp_name', 'WhatsApp Template Name')}</Label>
                <p className="text-sm font-mono mt-1">{template.whatsappTemplateName}</p>
              </div>
            )}

            {template.connection && (
              <div>
                <Label className="text-xs text-gray-500">{t('templates.whatsapp_connection', 'WhatsApp Connection')}</Label>
                <p className="text-sm font-medium mt-1">
                  {template.connection.phoneNumber || template.connection.accountName || t('templates.connection_fallback', 'Connection {{id}}', { id: template.connection.id })}
                  {template.connection.status && (
                    <span className={`ml-2 text-xs ${template.connection.status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
                      ({template.connection.status})
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Variables */}
          <div className="space-y-4">
            {variableDefinitions.length > 0 && (
              <div>
                <Label className="text-xs text-gray-500">{t('templates.variables', 'Variables')}</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {variableDefinitions.map((variable: any) => (
                    <Badge key={variable.id} variant="outline" className="font-mono">
                      {variable.component}{variable.buttonIndex !== undefined ? ` ${variable.buttonIndex + 1}` : ''}: {`{{${variable.name || variable.position}}}`}
                      {variableMappings[variable.id] ? ` → ${mappingToTemplateExpression(variableMappings[variable.id])}` : ''}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rejection Reason */}
          {template.whatsappTemplateStatus === 'rejected' && template.rejectionReason && (
            <>
              <Separator />
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <Label className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  {t('templates.rejection_reason', 'Rejection Reason')}
                </Label>
                <p className="text-sm text-red-700 mt-2">{template.rejectionReason}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              <span>
                {t('templates.metadata_created', 'Created')}{' '}
                {formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              <span>
                {t('templates.metadata_updated', 'Updated')}{' '}
                {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          </div>

          <aside className="order-first min-w-0 space-y-2 lg:order-last lg:sticky lg:top-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="h-4 w-4 text-muted-foreground" />
              {t('templates.preview', 'Template Preview')}
            </div>
            <WhatsAppTemplatePreview template={template} resolveMappings={false} />
            <p className="text-xs text-muted-foreground">
              {t('templates.preview_uses_examples', 'The preview uses the example values submitted to Meta. Default mappings are shown in the template details.')}
            </p>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

