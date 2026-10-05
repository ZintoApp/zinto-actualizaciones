import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { ExportFormatMenu } from '@/components/ui/export-format-menu';
import { downloadExportResponse, type DownloadExportFormat } from '@/lib/download-export';

interface CampaignDetail {
  id: number;
  contactName: string;
  phoneNumber: string;
  whatsappAccount: string;
  whatsappAccountId: number;
  messageStatus: 'pending' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  sentAt: string | null;
  messageContent: string;
  deliveryStatus: string | null;
  errorMessage: string | null;
}

interface CampaignDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: number;
  campaignName: string;
}

const ITEMS_PER_PAGE = 50;

export function CampaignDetailsModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
}: CampaignDetailsModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<CampaignDetail[]>([]);
  const [filteredData, setFilteredData] = useState<CampaignDetail[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState<keyof CampaignDetail>('sentAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedContent, setExpandedContent] = useState<Set<number>>(new Set());

  const fetchCampaignDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/details`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(t('campaigns.details.fetch_failed', 'Failed to fetch campaign details'));
      }

      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.error || t('campaigns.details.fetch_failed', 'Failed to fetch campaign details'));
      }
    } catch (error) {
      console.error('Error fetching campaign details:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.details.fetch_failed', 'Failed to fetch campaign details'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = data.filter((item) => {
      const matchesSearch =
        item.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.phoneNumber.includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || item.messageStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return sortOrder === 'asc' ? -1 : 1;
      if (bValue === null) return sortOrder === 'asc' ? 1 : -1;

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredData(filtered);
    setCurrentPage(1);
  }, [data, searchTerm, statusFilter, sortField, sortOrder]);

  useEffect(() => {
    if (isOpen && campaignId) {
      fetchCampaignDetails();
    }
  }, [isOpen, campaignId]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentData = filteredData.slice(startIndex, endIndex);


  const handleExport = async (format: DownloadExportFormat) => {
    setExporting(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/export/${format === 'xlsx' ? 'excel' : 'csv'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ campaignName }),
      });

      await downloadExportResponse(response, `campaign-${campaignName}`, format);

      toast({
        title: t('common.success', 'Success'),
        description: t('campaigns.details.export_success', 'Campaign data exported to Excel'),
      });
    } catch (error) {
      console.error('Error exporting Excel:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.details.export_failed', 'Failed to export Excel'),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      sent: 'default',
      delivered: 'secondary',
      failed: 'destructive',
      cancelled: 'outline',
    };

    return (
      <Badge variant={variants[status] || 'outline'}>
        {t(`campaigns.details.status.${status}`, status.charAt(0).toUpperCase() + status.slice(1))}
      </Badge>
    );
  };

  const toggleContentExpansion = (id: number) => {
    const newExpanded = new Set(expandedContent);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedContent(newExpanded);
  };

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const handleSort = (field: keyof CampaignDetail) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-campaigns-campaigndetailsmodal.dialogcontent.campaigns.details.title" className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('campaigns.details.title', 'Campaign Details')} - {campaignName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-4 py-4 border-b">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input data-tour="components-campaigns-campaigndetailsmodal.input.campaigns.details.search_placeholder"
              placeholder={t('campaigns.details.search_placeholder', 'Search by contact name or phone number...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-tour="components-campaigns-campaigndetailsmodal.selecttrigger.campaigns.details.filter_by_status" className="w-full sm:w-48">
              <SelectValue placeholder={t('campaigns.details.filter_by_status', 'Filter by status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('campaigns.details.all_statuses', 'All Statuses')}</SelectItem>
              <SelectItem value="pending">{t('campaigns.details.status.pending', 'Pending')}</SelectItem>
              <SelectItem value="sent">{t('campaigns.details.status.sent', 'Sent')}</SelectItem>
              <SelectItem value="delivered">{t('campaigns.details.status.delivered', 'Delivered')}</SelectItem>
              <SelectItem value="failed">{t('campaigns.details.status.failed', 'Failed')}</SelectItem>
              <SelectItem value="cancelled">{t('campaigns.details.status.cancelled', 'Cancelled')}</SelectItem>
            </SelectContent>
          </Select>

          <ExportFormatMenu onExport={handleExport} loading={exporting} disabled={loading} />
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {data.length === 0 ? t('campaigns.details.no_data', 'No campaign data found') : t('campaigns.details.no_results', 'No results match your search criteria')}
            </div>
          ) : (
            <Table data-tour="components-campaigns-campaigndetailsmodal.table.campaigns.details.table.contact_name">
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('contactName')}
                  >
                    {t('campaigns.details.table.contact_name', 'Contact Name')} {sortField === 'contactName' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('phoneNumber')}
                  >
                    {t('campaigns.details.table.phone_number', 'Phone Number')} {sortField === 'phoneNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('whatsappAccount')}
                  >
                    {t('campaigns.details.table.whatsapp_account', 'WhatsApp Account')} {sortField === 'whatsappAccount' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('messageStatus')}
                  >
                    {t('campaigns.details.table.status', 'Status')} {sortField === 'messageStatus' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('sentAt')}
                  >
                    {t('campaigns.details.table.sent_at', 'Sent At')} {sortField === 'sentAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>{t('campaigns.details.table.message_content', 'Message Content')}</TableHead>
                  <TableHead>{t('campaigns.details.table.error', 'Error')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.contactName}</TableCell>
                    <TableCell>{item.phoneNumber}</TableCell>
                    <TableCell>{item.whatsappAccount}</TableCell>
                    <TableCell>{getStatusBadge(item.messageStatus)}</TableCell>
                    <TableCell>
                      {item.sentAt ? new Date(item.sentAt).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex items-center gap-2">
                        <span className="flex-1">
                          {expandedContent.has(item.id)
                            ? item.messageContent
                            : truncateContent(item.messageContent)
                          }
                        </span>
                        {item.messageContent.length > 100 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleContentExpansion(item.id)}
                          >
                            {expandedContent.has(item.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {item.errorMessage ? (
                        <span className="text-destructive text-sm">{item.errorMessage}</span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-4 border-t">
            <div className="text-sm text-muted-foreground">
              {t('campaigns.details.pagination.showing', 'Showing {{start}} to {{end}} of {{total}} results', {
                start: startIndex + 1,
                end: Math.min(endIndex, filteredData.length),
                total: filteredData.length
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button data-tour="components-campaigns-campaigndetailsmodal.button.campaigns.details.pagination.previous"
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                {t('campaigns.details.pagination.previous', 'Previous')}
              </Button>
              <span className="text-sm">
                {t('campaigns.details.pagination.page_info', 'Page {{current}} of {{total}}', {
                  current: currentPage,
                  total: totalPages
                })}
              </span>
              <Button data-tour="components-campaigns-campaigndetailsmodal.button.campaigns.details.pagination.next"
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                {t('campaigns.details.pagination.next', 'Next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
