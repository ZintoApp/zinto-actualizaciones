import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Plus, Search, Pencil, Trash2, Calculator, BookOpen, PieChart as PieChartIcon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { useTranslation } from '@/hooks/use-translation';

// Types
type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
type JournalStatus = 'draft' | 'posted' | 'reversed';
type JournalReferenceType = 'invoice' | 'payment' | 'adjustment' | 'opening' | 'manual';
type ArApStatus = 'open' | 'partially_paid' | 'paid' | 'overdue' | 'written_off';

type ChartOfAccount = {
  id: number;
  companyId: number;
  accountCode: string;
  name: string;
  type: AccountType;
  subType: string | null;
  parentAccountId: number | null;
  isActive: boolean;
  balance: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type JournalEntry = {
  id: number;
  companyId: number;
  entryNumber: string;
  date: string;
  description: string | null;
  referenceType: JournalReferenceType;
  referenceId: number | null;
  reversalOfJournalEntryId: number | null;
  fiscalYearId: number | null;
  status: JournalStatus;
  postedBy: number | null;
  postedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

type JournalEntryLine = {
  id: number;
  journalEntryId: number;
  accountId: number;
  debit: string;
  credit: string;
  description: string | null;
  createdAt: string;
};

type TrialBalanceRow = {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debitBalance: string;
  creditBalance: string;
};

type ProfitAndLossReport = {
  revenue: Array<{ accountId: number; accountCode: string; accountName: string; amount: string }>;
  expenses: Array<{ accountId: number; accountCode: string; accountName: string; amount: string }>;
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
};

type BalanceSheetReport = {
  assets: Array<{ accountId: number; accountCode: string; accountName: string; balance: string }>;
  liabilities: Array<{ accountId: number; accountCode: string; accountName: string; balance: string }>;
  equity: Array<{ accountId: number; accountCode: string; accountName: string; balance: string }>;
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
};

type AgingRow = {
  contactId?: number;
  supplierId?: number;
  contactName?: string;
  supplierName?: string;
  current: string;
  days30: string;
  days60: string;
  days90: string;
  over90: string;
  total: string;
};

const accountTypeColors: Record<AccountType, string> = {
  asset: 'bg-blue-100 text-blue-800',
  liability: 'bg-red-100 text-red-800',
  equity: 'bg-purple-100 text-purple-800',
  revenue: 'bg-green-100 text-green-800',
  expense: 'bg-orange-100 text-orange-800',
};

const journalStatusColors: Record<JournalStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  posted: 'bg-green-100 text-green-800',
  reversed: 'bg-red-100 text-red-800',
};

const pieChartColors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function ERPAccountingPage() {
  const { user } = useAuth();
  const { hasAnyPermission } = usePermissions();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = user?.companyId;
  const canManage = hasAnyPermission(['manage_accounting']);
  const canPost = hasAnyPermission(['manage_accounting', 'post_journal_entries']);
  const previousCompanyIdRef = useRef<number | null>(companyId ?? null);

  const [activeTab, setActiveTab] = useState('chart-of-accounts');

  // Chart of Accounts State
  const [accountSearch, setAccountSearch] = useState('');
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [accountForm, setAccountForm] = useState({
    accountCode: '',
    name: '',
    type: 'asset' as AccountType,
    subType: '',
    parentAccountId: null as number | null,
    description: '',
  });

  // Journal Entries State
  const [journalSearch, setJournalSearch] = useState('');
  const [journalStatusFilter, setJournalStatusFilter] = useState<JournalStatus | 'all'>('all');
  const [journalDialogOpen, setJournalDialogOpen] = useState(false);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<JournalEntry | null>(null);
  const [editingJournalEntry, setEditingJournalEntry] = useState<JournalEntry | null>(null);
  const [adjustingSourceJournalEntry, setAdjustingSourceJournalEntry] = useState<JournalEntry | null>(null);
  const [journalEntryDate, setJournalEntryDate] = useState<Date>(new Date());
  const [journalReferenceType, setJournalReferenceType] = useState<JournalReferenceType>('manual');
  const [journalReferenceId, setJournalReferenceId] = useState<number | null>(null);
  const [journalDescription, setJournalDescription] = useState('');
  const [journalLines, setJournalLines] = useState<Array<{ accountId: number; debit: string; credit: string; description: string }>>([
    { accountId: 0, debit: '', credit: '', description: '' },
    { accountId: 0, debit: '', credit: '', description: '' },
  ]);

  // Reports State
  const [reportDateRange, setReportDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1),
    endDate: new Date(),
  });
  const [activeReport, setActiveReport] = useState<'trial-balance' | 'profit-loss' | 'balance-sheet' | 'ar-aging' | 'ap-aging'>('trial-balance');
  const [asOfDate, setAsOfDate] = useState<Date>(new Date());

  useEffect(() => {
    const previousCompanyId = previousCompanyIdRef.current;
    if (previousCompanyId === (companyId ?? null)) {
      return;
    }

    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && [
          'chart-of-accounts',
          'journal-entries',
          'journal-entry',
          'trial-balance',
          'profit-loss',
          'balance-sheet',
          'ar-aging',
          'ap-aging',
        ].includes(key);
      },
    });
    setSelectedJournalEntry(null);
    setEditingJournalEntry(null);
    previousCompanyIdRef.current = companyId ?? null;
  }, [companyId, queryClient]);

  // Queries
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['chart-of-accounts', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/accounting/accounts');
      const json = await res.json();
      return json.data as ChartOfAccount[];
    },
    enabled: !!companyId,
  });

  const { data: journalEntriesData, isLoading: journalLoading } = useQuery({
    queryKey: ['journal-entries', companyId, journalSearch, journalStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (journalSearch) params.set('search', journalSearch);
      if (journalStatusFilter !== 'all') params.set('status', journalStatusFilter);
      const res = await apiRequest('GET', `/api/erp/accounting/journal-entries?${params.toString()}`);
      const json = await res.json();
      return json as { data: JournalEntry[]; total: number };
    },
    enabled: !!companyId,
  });

  const activeJournalEntryId = editingJournalEntry?.id ?? adjustingSourceJournalEntry?.id ?? selectedJournalEntry?.id;

  const { data: journalEntryDetail } = useQuery({
    queryKey: ['journal-entry', companyId, activeJournalEntryId],
    queryFn: async () => {
      if (!activeJournalEntryId) return null;
      const res = await apiRequest('GET', `/api/erp/accounting/journal-entries/${activeJournalEntryId}`);
      const json = await res.json();
      return json.data as JournalEntry & { lines: JournalEntryLine[] };
    },
    enabled: !!activeJournalEntryId,
  });

  // Report queries
  const { data: trialBalance, isLoading: trialBalanceLoading } = useQuery({
    queryKey: ['trial-balance', companyId, asOfDate],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/accounting/reports/trial-balance?asOfDate=${asOfDate.toISOString()}`);
      const json = await res.json();
      return json.data as TrialBalanceRow[];
    },
    enabled: !!companyId && activeReport === 'trial-balance',
  });

  const { data: profitLoss, isLoading: profitLossLoading } = useQuery({
    queryKey: ['profit-loss', companyId, reportDateRange],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/accounting/reports/profit-loss?startDate=${reportDateRange.startDate.toISOString()}&endDate=${reportDateRange.endDate.toISOString()}`);
      const json = await res.json();
      return json.data as ProfitAndLossReport;
    },
    enabled: !!companyId && activeReport === 'profit-loss',
  });

  const { data: balanceSheet, isLoading: balanceSheetLoading } = useQuery({
    queryKey: ['balance-sheet', companyId, asOfDate],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/accounting/reports/balance-sheet?asOfDate=${asOfDate.toISOString()}`);
      const json = await res.json();
      return json.data as BalanceSheetReport;
    },
    enabled: !!companyId && activeReport === 'balance-sheet',
  });

  const { data: arAging, isLoading: arAgingLoading } = useQuery({
    queryKey: ['ar-aging', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/accounting/reports/ar-aging');
      const json = await res.json();
      return json.data as AgingRow[];
    },
    enabled: !!companyId && activeReport === 'ar-aging',
  });

  const { data: apAging, isLoading: apAgingLoading } = useQuery({
    queryKey: ['ap-aging', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/accounting/reports/ap-aging');
      const json = await res.json();
      return json.data as AgingRow[];
    },
    enabled: !!companyId && activeReport === 'ap-aging',
  });

  // Mutations
  const createAccountMutation = useMutation({
    mutationFn: async (data: typeof accountForm) => {
      const res = await apiRequest('POST', '/api/erp/accounting/accounts', {
        ...data,
        companyId,
        isActive: true,
        balance: '0',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.accounting.errors.createFailed', 'Create failed'));
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts', companyId] });
      setAccountDialogOpen(false);
      toast({ title: t('erp.accounting.toast.accountCreated', 'Account created successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('erp.accounting.toast.errorCreatingAccount', 'Error creating account'), description: error.message, variant: 'destructive' });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof accountForm> }) => {
      const res = await apiRequest('PUT', `/api/erp/accounting/accounts/${id}`, data);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.accounting.errors.updateFailed', 'Update failed'));
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts', companyId] });
      setAccountDialogOpen(false);
      setEditingAccount(null);
      toast({ title: t('erp.accounting.toast.accountUpdated', 'Account updated successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('erp.accounting.toast.errorUpdatingAccount', 'Error updating account'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/erp/accounting/accounts/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.accounting.errors.deleteFailed', 'Delete failed'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts', companyId] });
      toast({ title: t('erp.accounting.toast.accountDeleted', 'Account deleted successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('erp.accounting.toast.errorDeletingAccount', 'Error deleting account'), description: error.message, variant: 'destructive' });
    },
  });

  const resetJournalForm = () => {
    setEditingJournalEntry(null);
    setAdjustingSourceJournalEntry(null);
    setJournalEntryDate(new Date());
    setJournalReferenceType('manual');
    setJournalReferenceId(null);
    setJournalDescription('');
    setJournalLines([
      { accountId: 0, debit: '', credit: '', description: '' },
      { accountId: 0, debit: '', credit: '', description: '' },
    ]);
  };

  const openCreateJournalDialog = () => {
    resetJournalForm();
    setJournalDialogOpen(true);
  };

  const openEditJournalDialog = (entry: JournalEntry) => {
    resetJournalForm();
    setEditingJournalEntry(entry);
    setJournalDialogOpen(true);
  };

  const openAdjustingEntryDialog = (entry: JournalEntry) => {
    resetJournalForm();
    setAdjustingSourceJournalEntry(entry);
    setJournalReferenceType('adjustment');
    setJournalReferenceId(entry.id);
    setJournalDescription(t('erp.accounting.journal.adjustmentFor', 'Adjustment for {{entryNumber}}: {{description}}', {
      entryNumber: entry.entryNumber,
      description: entry.description || '',
    }).trim());
    setJournalDialogOpen(true);
  };

  const seedAccountsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/accounting/accounts/seed');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.accounting.errors.seedFailed', 'Seed failed'));
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts', companyId] });
      toast({ title: t('erp.accounting.toast.seeded', 'Default accounts seeded successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('erp.accounting.toast.errorSeeding', 'Error seeding accounts'), description: error.message, variant: 'destructive' });
    },
  });

  const createJournalEntryMutation = useMutation({
    mutationFn: async (data: { entry: any; lines: any[] }) => {
      const res = await apiRequest('POST', '/api/erp/accounting/journal-entries', data);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.accounting.errors.createFailed', 'Create failed'));
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries', companyId] });
      setJournalDialogOpen(false);
      resetJournalForm();
      toast({ title: t('erp.accounting.toast.journalCreated', 'Journal entry created successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('erp.accounting.toast.errorCreatingJournal', 'Error creating journal entry'), description: error.message, variant: 'destructive' });
    },
  });

  const updateJournalEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { entry: any; lines: any[] } }) => {
      const res = await apiRequest('PUT', `/api/erp/accounting/journal-entries/${id}`, data);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.accounting.errors.updateFailed', 'Update failed'));
      return json.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries', companyId] });
      queryClient.invalidateQueries({ queryKey: ['journal-entry', companyId, variables.id] });
      setJournalDialogOpen(false);
      resetJournalForm();
      toast({ title: t('erp.accounting.toast.journalUpdated', 'Journal entry updated successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('erp.accounting.toast.errorUpdatingJournal', 'Error updating journal entry'), description: error.message, variant: 'destructive' });
    },
  });

  const postJournalEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/accounting/journal-entries/${id}/post`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.accounting.errors.postFailed', 'Post failed'));
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries', companyId] });
      toast({ title: t('erp.accounting.toast.journalPosted', 'Journal entry posted successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('erp.accounting.toast.errorPostingJournal', 'Error posting journal entry'), description: error.message, variant: 'destructive' });
    },
  });

  const reverseJournalEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/accounting/journal-entries/${id}/reverse`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.accounting.errors.reverseFailed', 'Reverse failed'));
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries', companyId] });
      toast({ title: t('erp.accounting.toast.journalReversed', 'Journal entry reversed successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('erp.accounting.toast.errorReversingJournal', 'Error reversing journal entry'), description: error.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    const sourceEntryId = editingJournalEntry?.id ?? adjustingSourceJournalEntry?.id;
    if (!journalDialogOpen || !sourceEntryId || journalEntryDetail?.id !== sourceEntryId) {
      return;
    }

    if (editingJournalEntry) {
      setJournalEntryDate(new Date(journalEntryDetail.date));
      setJournalReferenceType('manual');
      setJournalReferenceId(null);
      setJournalDescription(journalEntryDetail.description || '');
    }
    setJournalLines(
      journalEntryDetail.lines.map((line) => ({
        accountId: line.accountId,
        debit: parseFloat(line.debit) > 0 ? line.debit : '',
        credit: parseFloat(line.credit) > 0 ? line.credit : '',
        description: line.description || '',
      })),
    );
  }, [editingJournalEntry, adjustingSourceJournalEntry, journalDialogOpen, journalEntryDetail]);

  // Helpers
  const buildAccountTree = (flatAccounts: ChartOfAccount[]) => {
    const map = new Map<number, ChartOfAccount & { children: (ChartOfAccount & { children: any[] })[] }>();
    const roots: (ChartOfAccount & { children: any[] })[] = [];

    flatAccounts.forEach(acc => {
      map.set(acc.id, { ...acc, children: [] });
    });

    flatAccounts.forEach(acc => {
      const node = map.get(acc.id)!;
      if (acc.parentAccountId && map.has(acc.parentAccountId)) {
        map.get(acc.parentAccountId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const accountTree = useMemo(() => buildAccountTree(accounts), [accounts]);

  const filteredAccounts = useMemo(() => {
    if (!accountSearch) return accounts;
    const search = accountSearch.toLowerCase();
    return accounts.filter(acc =>
      acc.name.toLowerCase().includes(search) ||
      acc.accountCode.toLowerCase().includes(search)
    );
  }, [accounts, accountSearch]);

  const totalDebits = journalLines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
  const totalCredits = journalLines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.001;
  const trialBalanceTotals = useMemo(() => ({
    debit: (trialBalance ?? []).reduce((sum, row) => sum + (parseFloat(row.debitBalance) || 0), 0),
    credit: (trialBalance ?? []).reduce((sum, row) => sum + (parseFloat(row.creditBalance) || 0), 0),
  }), [trialBalance]);
  const arAgingTotals = useMemo(() => ({
    current: (arAging ?? []).reduce((sum, row) => sum + (parseFloat(row.current) || 0), 0),
    days30: (arAging ?? []).reduce((sum, row) => sum + (parseFloat(row.days30) || 0), 0),
    days60: (arAging ?? []).reduce((sum, row) => sum + (parseFloat(row.days60) || 0), 0),
    days90: (arAging ?? []).reduce((sum, row) => sum + (parseFloat(row.days90) || 0), 0),
    over90: (arAging ?? []).reduce((sum, row) => sum + (parseFloat(row.over90) || 0), 0),
    total: (arAging ?? []).reduce((sum, row) => sum + (parseFloat(row.total) || 0), 0),
  }), [arAging]);
  const apAgingTotals = useMemo(() => ({
    current: (apAging ?? []).reduce((sum, row) => sum + (parseFloat(row.current) || 0), 0),
    days30: (apAging ?? []).reduce((sum, row) => sum + (parseFloat(row.days30) || 0), 0),
    days60: (apAging ?? []).reduce((sum, row) => sum + (parseFloat(row.days60) || 0), 0),
    days90: (apAging ?? []).reduce((sum, row) => sum + (parseFloat(row.days90) || 0), 0),
    over90: (apAging ?? []).reduce((sum, row) => sum + (parseFloat(row.over90) || 0), 0),
    total: (apAging ?? []).reduce((sum, row) => sum + (parseFloat(row.total) || 0), 0),
  }), [apAging]);
  // Render functions
  const renderAccountNode = (account: ChartOfAccount & { children: any[] }, level = 0) => {
    const hasChildren = account.children.length > 0;
    const content = (
      <div className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted">
        <div className="flex items-center gap-2" style={{ paddingLeft: level * 20 }}>
          <span className="font-mono text-sm text-muted-foreground">{account.accountCode}</span>
          <span className="font-medium">{account.name}</span>
          <Badge className={accountTypeColors[account.type]}>{account.type}</Badge>
          {account.subType && <span className="text-xs text-muted-foreground">({account.subType})</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{parseFloat(account.balance).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditingAccount(account);
                  setAccountForm({
                    accountCode: account.accountCode,
                    name: account.name,
                    type: account.type,
                    subType: account.subType || '',
                    parentAccountId: account.parentAccountId,
                    description: account.description || '',
                  });
                  setAccountDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteAccountMutation.mutate(account.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>
    );

    if (hasChildren) {
      return (
        <AccordionItem key={account.id} value={String(account.id)}>
          <AccordionTrigger className="py-0 hover:no-underline">
            {content}
          </AccordionTrigger>
          <AccordionContent>
            {account.children.map(child => renderAccountNode(child, level + 1))}
          </AccordionContent>
        </AccordionItem>
      );
    }

    return <div key={account.id}>{content}</div>;
  };

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <main className="flex-1 p-6 overflow-auto">
          <div className="w-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Calculator className="h-8 w-8 text-primary" />
                <h1 data-tour="pages-erp-accounting.h1.erp.accounting.title" className="text-2xl">{t('erp.accounting.title', 'Accounting')}</h1>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger data-tour="pages-erp-accounting.tabstrigger.chart-of-accounts" value="chart-of-accounts">
                  <BookOpen className="h-4 w-4 mr-2" />
                  {t('erp.accounting.tabs.chartOfAccounts', 'Chart of Accounts')}
                </TabsTrigger>
                <TabsTrigger data-tour="pages-erp-accounting.tabstrigger.journal-entries" value="journal-entries">
                  <Calculator className="h-4 w-4 mr-2" />
                  {t('erp.accounting.tabs.journalEntries', 'Journal Entries')}
                </TabsTrigger>
                <TabsTrigger data-tour="pages-erp-accounting.tabstrigger.reports" value="reports">
                  <PieChartIcon className="h-4 w-4 mr-2" />
                  {t('erp.accounting.tabs.financialReports', 'Financial Reports')}
                </TabsTrigger>
              </TabsList>

              {/* Chart of Accounts Tab */}
              <TabsContent data-tour="pages-erp-accounting.tabscontent.chart-of-accounts" value="chart-of-accounts">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('erp.accounting.cards.chartOfAccounts', 'Chart of Accounts')}</CardTitle>
                    <div className="flex gap-2">
                      {canManage && (
                        <>
                          <Button data-tour="pages-erp-accounting.button.erp.accounting.actions.seedDefaultAccounts"
                            variant="outline"
                            onClick={() => seedAccountsMutation.mutate()}
                            disabled={seedAccountsMutation.isPending}
                          >
                            {seedAccountsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('erp.accounting.actions.seedDefaultAccounts', 'Seed Default Accounts')}
                          </Button>
                          <Button data-tour="pages-erp-accounting.button.erp.accounting.actions.addAccount"
                            onClick={() => {
                              setEditingAccount(null);
                              setAccountForm({
                                accountCode: '',
                                name: '',
                                type: 'asset',
                                subType: '',
                                parentAccountId: null,
                                description: '',
                              });
                              setAccountDialogOpen(true);
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {t('erp.accounting.actions.addAccount', 'Add Account')}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input data-tour="pages-erp-accounting.input.erp.accounting.search.accounts"
                          placeholder={t('erp.accounting.search.accounts', 'Search accounts...')}
                          className="pl-9"
                          value={accountSearch}
                          onChange={(e) => setAccountSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    {accountsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Accordion type="multiple" className="w-full">
                          {accountSearch
                            ? filteredAccounts.map(acc => renderAccountNode({ ...acc, children: [] }))
                            : accountTree.map(acc => renderAccountNode(acc))
                          }
                        </Accordion>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Journal Entries Tab */}
              <TabsContent data-tour="pages-erp-accounting.tabscontent.journal-entries" value="journal-entries">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('erp.accounting.cards.journalEntries', 'Journal Entries')}</CardTitle>
                    {canManage && (
                      <Button data-tour="pages-erp-accounting.button.erp.accounting.actions.createManualEntry" onClick={openCreateJournalDialog}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t('erp.accounting.actions.createManualEntry', 'Create Manual Entry')}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input data-tour="pages-erp-accounting.input.erp.accounting.search.journalEntries"
                          placeholder={t('erp.accounting.search.journalEntries', 'Search journal entries...')}
                          className="pl-9"
                          value={journalSearch}
                          onChange={(e) => setJournalSearch(e.target.value)}
                        />
                      </div>
                      <Select value={journalStatusFilter} onValueChange={(v) => setJournalStatusFilter(v as JournalStatus | 'all')}>
                        <SelectTrigger data-tour="pages-erp-accounting.selecttrigger.erp.common.status" className="w-40">
                          <SelectValue placeholder={t('erp.common.status', 'Status')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('erp.accounting.allStatuses', 'All Statuses')}</SelectItem>
                          <SelectItem value="draft">{t('erp.accounting.status.draft', 'Draft')}</SelectItem>
                          <SelectItem value="posted">{t('erp.accounting.status.posted', 'Posted')}</SelectItem>
                          <SelectItem value="reversed">{t('erp.accounting.status.reversed', 'Reversed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {journalLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : (
                      <Table data-tour="pages-erp-accounting.table.erp.accounting.table.entryNumber">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('erp.accounting.table.entryNumber', 'Entry #')}</TableHead>
                            <TableHead>{t('erp.common.date', 'Date')}</TableHead>
                            <TableHead>{t('erp.common.description', 'Description')}</TableHead>
                            <TableHead>{t('erp.accounting.table.reference', 'Reference')}</TableHead>
                            <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                            <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {journalEntriesData?.data.map((entry) => (
                            <TableRow
                              key={entry.id}
                              className="cursor-pointer hover:bg-muted"
                              onClick={() => setSelectedJournalEntry(entry)}
                            >
                              <TableCell className="font-medium">{entry.entryNumber}</TableCell>
                              <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                              <TableCell>{entry.description || '-'}</TableCell>
                              <TableCell>{entry.referenceType}{entry.referenceId ? ` #${entry.referenceId}` : ''}</TableCell>
                              <TableCell>
                                <Badge className={journalStatusColors[entry.status]}>
                                  {entry.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end flex-wrap gap-1.5">
                                {entry.status === 'draft' && entry.referenceType === 'manual' && canManage && (
                                  <Button data-tour="pages-erp-accounting.button.erp.common.edit"
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditJournalDialog(entry);
                                    }}
                                  >
                                  {t('erp.common.edit', 'Edit')}
                                  </Button>
                                )}
                                {entry.status === 'draft' && canPost && (
                                  <Button data-tour="pages-erp-accounting.button.erp.accounting.actions.post"
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    disabled={postJournalEntryMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      postJournalEntryMutation.mutate(entry.id);
                                    }}
                                  >
                                    {t('erp.accounting.actions.post', 'Post')}
                                  </Button>
                                )}
                                {entry.status === 'posted' && canManage && (
                                  <Button data-tour="pages-erp-accounting.button.erp.accounting.actions.adjust"
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAdjustingEntryDialog(entry);
                                    }}
                                  >
                                    {t('erp.accounting.actions.adjust', 'Adjust')}
                                  </Button>
                                )}
                                {entry.status === 'posted' && !entry.reversalOfJournalEntryId && canPost && (
                                  <Button data-tour="pages-erp-accounting.button.erp.accounting.actions.reverse"
                                    variant="destructive"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    disabled={reverseJournalEntryMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      reverseJournalEntryMutation.mutate(entry.id);
                                    }}
                                  >
                                    {reverseJournalEntryMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                    {t('erp.accounting.actions.reverse', 'Reverse')}
                                  </Button>
                                )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Financial Reports Tab */}
              <TabsContent data-tour="pages-erp-accounting.tabscontent.reports" value="reports">
                <div className="flex gap-4 mb-6">
                  <Select value={activeReport} onValueChange={(v) => setActiveReport(v as typeof activeReport)}>
                    <SelectTrigger data-tour="pages-erp-accounting.selecttrigger.erp.accounting.selectReport" className="w-60">
                      <SelectValue placeholder={t('erp.accounting.selectReport', 'Select report')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial-balance">{t('erp.accounting.reports.trialBalance', 'Trial Balance')}</SelectItem>
                      <SelectItem value="profit-loss">{t('erp.accounting.reports.profitLoss', 'Profit & Loss')}</SelectItem>
                      <SelectItem value="balance-sheet">{t('erp.accounting.reports.balanceSheet', 'Balance Sheet')}</SelectItem>
                      <SelectItem value="ar-aging">{t('erp.accounting.reports.arAging', 'AR Aging')}</SelectItem>
                      <SelectItem value="ap-aging">{t('erp.accounting.reports.apAging', 'AP Aging')}</SelectItem>
                    </SelectContent>
                  </Select>

                  {activeReport === 'trial-balance' || activeReport === 'balance-sheet' ? (
                    <DatePicker
                      date={asOfDate}
                      onSelect={(d) => {
                        if (d) setAsOfDate(d);
                      }}
                    />
                  ) : activeReport === 'profit-loss' ? (
                    <>
                      <DatePicker
                        date={reportDateRange.startDate}
                        onSelect={(d) => d && setReportDateRange(prev => ({ ...prev, startDate: d }))}
                      />
                      <DatePicker
                        date={reportDateRange.endDate}
                        onSelect={(d) => d && setReportDateRange(prev => ({ ...prev, endDate: d }))}
                      />
                    </>
                  ) : null}
                </div>

                {/* Trial Balance Report */}
                {activeReport === 'trial-balance' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('erp.accounting.reports.trialBalance', 'Trial Balance')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {trialBalanceLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                      ) : (
                        <Table data-tour="pages-erp-accounting.table.erp.accounting.table.accountCode">
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('erp.accounting.table.accountCode', 'Account Code')}</TableHead>
                              <TableHead>{t('erp.accounting.table.accountName', 'Account Name')}</TableHead>
                              <TableHead>{t('erp.common.type', 'Type')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.table.debit', 'Debit')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.table.credit', 'Credit')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {trialBalance?.map((row) => (
                              <TableRow key={row.accountId}>
                                <TableCell className="font-medium">{row.accountCode}</TableCell>
                                <TableCell>{row.accountName}</TableCell>
                                <TableCell>
                                  <Badge className={accountTypeColors[row.accountType as AccountType]}>
                                    {row.accountType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {parseFloat(row.debitBalance) > 0 ? formatUsd(parseFloat(row.debitBalance)) : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {parseFloat(row.creditBalance) > 0 ? formatUsd(parseFloat(row.creditBalance)) : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                            {(trialBalance?.length ?? 0) > 0 && (
                              <TableRow className="bg-muted/30 font-medium">
                                <TableCell colSpan={3}>{t('erp.common.total', 'Total')}</TableCell>
                                <TableCell className="text-right">{formatUsd(trialBalanceTotals.debit)}</TableCell>
                                <TableCell className="text-right">{formatUsd(trialBalanceTotals.credit)}</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Profit & Loss Report */}
                {activeReport === 'profit-loss' && profitLoss && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>{t('erp.accounting.reports.profitLossStatement', 'Profit & Loss Statement')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6">
                          <div>
                            <h4 className="font-semibold mb-2 text-green-700">{t('erp.accounting.revenue', 'Revenue')}</h4>
                            <Table data-tour="pages-erp-accounting.table.erp.accounting.totalRevenue">
                              <TableBody>
                                {profitLoss.revenue.map((row) => (
                                  <TableRow key={row.accountId}>
                                    <TableCell>{row.accountName}</TableCell>
                                    <TableCell className="text-right">
                                      {parseFloat(row.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="font-semibold bg-muted/50">
                                  <TableCell>{t('erp.accounting.totalRevenue', 'Total Revenue')}</TableCell>
                                  <TableCell className="text-right">
                                    {parseFloat(profitLoss.totalRevenue).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                          <div>
                            <h4 className="font-semibold mb-2 text-red-700">{t('erp.accounting.expenses', 'Expenses')}</h4>
                            <Table data-tour="pages-erp-accounting.table.erp.accounting.totalExpenses">
                              <TableBody>
                                {profitLoss.expenses.map((row) => (
                                  <TableRow key={row.accountId}>
                                    <TableCell>{row.accountName}</TableCell>
                                    <TableCell className="text-right">
                                      {parseFloat(row.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="font-semibold bg-muted/50">
                                  <TableCell>{t('erp.accounting.totalExpenses', 'Total Expenses')}</TableCell>
                                  <TableCell className="text-right">
                                    {parseFloat(profitLoss.totalExpenses).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                          <div className="pt-4 border-t">
                            <div className="flex justify-between items-center">
                              <span className="text-lg font-bold">{t('erp.accounting.netIncome', 'Net Income')}</span>
                              <span className={`text-lg font-bold ${parseFloat(profitLoss.netIncome) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {parseFloat(profitLoss.netIncome).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>{t('erp.accounting.reports.revenueVsExpenses', 'Revenue vs Expenses')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={[
                            { name: t('erp.accounting.revenue', 'Revenue'), amount: parseFloat(profitLoss.totalRevenue) },
                            { name: t('erp.accounting.expenses', 'Expenses'), amount: parseFloat(profitLoss.totalExpenses) },
                            { name: t('erp.accounting.netIncome', 'Net Income'), amount: parseFloat(profitLoss.netIncome) },
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} />
                            <Bar dataKey="amount" fill="#8884d8" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Balance Sheet Report */}
                {activeReport === 'balance-sheet' && balanceSheet && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>{t('erp.accounting.assets', 'Assets')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table data-tour="pages-erp-accounting.table.erp.accounting.totalAssets">
                            <TableBody>
                              {balanceSheet.assets.map((row) => (
                                <TableRow key={row.accountId}>
                                  <TableCell>{row.accountName}</TableCell>
                                  <TableCell className="text-right">
                                    {parseFloat(row.balance).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="font-semibold bg-muted/50">
                                <TableCell>{t('erp.accounting.totalAssets', 'Total Assets')}</TableCell>
                                <TableCell className="text-right">
                                  {parseFloat(balanceSheet.totalAssets).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>{t('erp.accounting.liabilities', 'Liabilities')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table data-tour="pages-erp-accounting.table.erp.accounting.totalLiabilities">
                            <TableBody>
                              {balanceSheet.liabilities.map((row) => (
                                <TableRow key={row.accountId}>
                                  <TableCell>{row.accountName}</TableCell>
                                  <TableCell className="text-right">
                                    {parseFloat(row.balance).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="font-semibold bg-muted/50">
                                <TableCell>{t('erp.accounting.totalLiabilities', 'Total Liabilities')}</TableCell>
                                <TableCell className="text-right">
                                  {parseFloat(balanceSheet.totalLiabilities).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>{t('erp.accounting.equity', 'Equity')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table data-tour="pages-erp-accounting.table.erp.accounting.totalEquity">
                            <TableBody>
                              {balanceSheet.equity.map((row) => (
                                <TableRow key={row.accountId}>
                                  <TableCell>{row.accountName}</TableCell>
                                  <TableCell className="text-right">
                                    {parseFloat(row.balance).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="font-semibold bg-muted/50">
                                <TableCell>{t('erp.accounting.totalEquity', 'Total Equity')}</TableCell>
                                <TableCell className="text-right">
                                  {parseFloat(balanceSheet.totalEquity).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>{t('erp.accounting.reports.assetComposition', 'Asset Composition')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={400}>
                          <PieChart>
                            <Pie
                              data={balanceSheet.assets.slice(0, 6)}
                              dataKey="balance"
                              nameKey="accountName"
                              cx="50%"
                              cy="50%"
                              outerRadius={120}
                              label={(entry: any) => `${entry.accountName}: $${parseFloat(entry.balance).toLocaleString()}`}
                            >
                              {balanceSheet.assets.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={pieChartColors[index % pieChartColors.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: string) => parseFloat(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* AR Aging Report */}
                {activeReport === 'ar-aging' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('erp.accounting.reports.accountsReceivableAging', 'Accounts Receivable Aging')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {arAgingLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                      ) : (
                        <Table data-tour="pages-erp-accounting.table.erp.accounting.table.customer">
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('erp.accounting.table.customer', 'Customer')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.current', 'Current')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.days1to30', '1-30 Days')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.days31to60', '31-60 Days')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.days61to90', '61-90 Days')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.over90', 'Over 90')}</TableHead>
                              <TableHead className="text-right">{t('erp.common.total', 'Total')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(arAging?.length ?? 0) === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                                  {t('erp.accounting.emptyAging', 'No aging data available for the selected period.')}
                                </TableCell>
                              </TableRow>
                            ) : (
                              arAging?.map((row) => (
                                <TableRow key={row.contactId}>
                                  <TableCell>{row.contactName}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.current))}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.days30))}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.days60))}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.days90))}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.over90))}</TableCell>
                                  <TableCell className="text-right font-semibold">{formatUsd(parseFloat(row.total))}</TableCell>
                                </TableRow>
                              ))
                            )}
                            {(arAging?.length ?? 0) > 0 && (
                              <TableRow className="bg-muted/30 font-medium">
                                <TableCell>{t('erp.common.total', 'Total')}</TableCell>
                                <TableCell className="text-right">{formatUsd(arAgingTotals.current)}</TableCell>
                                <TableCell className="text-right">{formatUsd(arAgingTotals.days30)}</TableCell>
                                <TableCell className="text-right">{formatUsd(arAgingTotals.days60)}</TableCell>
                                <TableCell className="text-right">{formatUsd(arAgingTotals.days90)}</TableCell>
                                <TableCell className="text-right">{formatUsd(arAgingTotals.over90)}</TableCell>
                                <TableCell className="text-right font-semibold">{formatUsd(arAgingTotals.total)}</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* AP Aging Report */}
                {activeReport === 'ap-aging' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('erp.accounting.reports.accountsPayableAging', 'Accounts Payable Aging')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {apAgingLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                      ) : (
                        <Table data-tour="pages-erp-accounting.table.erp.purchaseOrders.filters.supplier">
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('erp.purchaseOrders.filters.supplier', 'Supplier')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.current', 'Current')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.days1to30', '1-30 Days')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.days31to60', '31-60 Days')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.days61to90', '61-90 Days')}</TableHead>
                              <TableHead className="text-right">{t('erp.accounting.aging.over90', 'Over 90')}</TableHead>
                              <TableHead className="text-right">{t('erp.common.total', 'Total')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(apAging?.length ?? 0) === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                                  {t('erp.accounting.emptyAging', 'No aging data available for the selected period.')}
                                </TableCell>
                              </TableRow>
                            ) : (
                              apAging?.map((row) => (
                                <TableRow key={row.supplierId}>
                                  <TableCell>{row.supplierName}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.current))}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.days30))}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.days60))}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.days90))}</TableCell>
                                  <TableCell className="text-right">{formatUsd(parseFloat(row.over90))}</TableCell>
                                  <TableCell className="text-right font-semibold">{formatUsd(parseFloat(row.total))}</TableCell>
                                </TableRow>
                              ))
                            )}
                            {(apAging?.length ?? 0) > 0 && (
                              <TableRow className="bg-muted/30 font-medium">
                                <TableCell>{t('erp.common.total', 'Total')}</TableCell>
                                <TableCell className="text-right">{formatUsd(apAgingTotals.current)}</TableCell>
                                <TableCell className="text-right">{formatUsd(apAgingTotals.days30)}</TableCell>
                                <TableCell className="text-right">{formatUsd(apAgingTotals.days60)}</TableCell>
                                <TableCell className="text-right">{formatUsd(apAgingTotals.days90)}</TableCell>
                                <TableCell className="text-right">{formatUsd(apAgingTotals.over90)}</TableCell>
                                <TableCell className="text-right font-semibold">{formatUsd(apAgingTotals.total)}</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Account Dialog */}
      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent data-tour="pages-erp-accounting.dialogcontent.erp.accounting.dialog.editAccount" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAccount ? t('erp.accounting.dialog.editAccount', 'Edit Account') : t('erp.accounting.dialog.createAccount', 'Create Account')}</DialogTitle>
            <DialogDescription>
              {editingAccount
                ? t('erp.accounting.dialog.editAccountDescription', 'Update this chart of accounts record.')
                : t('erp.accounting.dialog.createAccountDescription', 'Create a new chart of accounts record.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('erp.accounting.form.accountCode', 'Account Code')}</Label>
                <Input data-tour="pages-erp-accounting.input.erp.accounting.form.accountCodePlaceholder"
                  value={accountForm.accountCode}
                  onChange={(e) => setAccountForm({ ...accountForm, accountCode: e.target.value })}
                  placeholder={t('erp.accounting.form.accountCodePlaceholder', '1000')}
                />
              </div>
              <div>
                <Label>{t('erp.common.type', 'Type')}</Label>
                <Select
                  value={accountForm.type}
                  onValueChange={(v) => setAccountForm({ ...accountForm, type: v as AccountType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="asset">{t('erp.accounting.accountType.asset', 'Asset')}</SelectItem>
                    <SelectItem value="liability">{t('erp.accounting.accountType.liability', 'Liability')}</SelectItem>
                    <SelectItem value="equity">{t('erp.accounting.accountType.equity', 'Equity')}</SelectItem>
                    <SelectItem value="revenue">{t('erp.accounting.accountType.revenue', 'Revenue')}</SelectItem>
                    <SelectItem value="expense">{t('erp.accounting.accountType.expense', 'Expense')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t('erp.accounting.form.accountName', 'Account Name')}</Label>
              <Input data-tour="pages-erp-accounting.input.erp.accounting.form.accountNamePlaceholder"
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder={t('erp.accounting.form.accountNamePlaceholder', 'Cash')}
              />
            </div>
            <div>
              <Label>{t('erp.accounting.form.subType', 'Sub Type')}</Label>
              <Input data-tour="pages-erp-accounting.input.erp.accounting.form.subTypePlaceholder"
                value={accountForm.subType}
                onChange={(e) => setAccountForm({ ...accountForm, subType: e.target.value })}
                placeholder={t('erp.accounting.form.subTypePlaceholder', 'current_asset')}
              />
            </div>
            <div>
              <Label>{t('erp.accounting.form.parentAccount', 'Parent Account')}</Label>
              <Select
                value={accountForm.parentAccountId?.toString() || 'null'}
                onValueChange={(v) => setAccountForm({ ...accountForm, parentAccountId: v === 'null' ? null : parseInt(v) })}
              >
                <SelectTrigger data-tour="pages-erp-accounting.selecttrigger.erp.accounting.form.noneRootAccount">
                  <SelectValue placeholder={t('erp.accounting.form.noneRootAccount', 'None (Root Account)')} />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="null">{t('erp.accounting.form.noneRootAccount', 'None (Root Account)')}</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id.toString()}>
                      {acc.accountCode} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('erp.common.description', 'Description')}</Label>
              <Textarea data-tour="pages-erp-accounting.textarea.erp.accounting.form.optionalDescription"
                value={accountForm.description}
                onChange={(e) => setAccountForm({ ...accountForm, description: e.target.value })}
                placeholder={t('erp.accounting.form.optionalDescription', 'Optional description')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-accounting.button.ui.common.cancel" variant="outline" onClick={() => setAccountDialogOpen(false)}>{t('ui.common.cancel', 'Cancel')}</Button>
            <Button data-tour="pages-erp-accounting.button.erp.common.update"
              onClick={() => {
                if (editingAccount) {
                  updateAccountMutation.mutate({ id: editingAccount.id, data: accountForm });
                } else {
                  createAccountMutation.mutate(accountForm);
                }
              }}
              disabled={createAccountMutation.isPending || updateAccountMutation.isPending}
            >
              {(createAccountMutation.isPending || updateAccountMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingAccount ? t('erp.common.update', 'Update') : t('erp.common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Journal Entry Dialog */}
      <Dialog open={journalDialogOpen} onOpenChange={(open) => {
        setJournalDialogOpen(open);
        if (!open) {
          resetJournalForm();
        }
      }}>
        <DialogContent data-tour="pages-erp-accounting.dialogcontent.erp.accounting.dialog.editJournalEntry" className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJournalEntry ? t('erp.accounting.dialog.editJournalEntry', 'Edit Journal Entry') : t('erp.accounting.dialog.createJournalEntry', 'Create Journal Entry')}</DialogTitle>
            <DialogDescription>
              {editingJournalEntry
                ? t('erp.accounting.dialog.editJournalEntryDescription', 'Update a manual draft journal entry.')
                : t('erp.accounting.dialog.createJournalEntryDescription', 'Create a balanced journal entry.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('erp.common.date', 'Date')}</Label>
                <DatePicker
                  date={journalEntryDate}
                  onSelect={(d) => {
                    if (d) setJournalEntryDate(d);
                  }}
                />
              </div>
              <div>
                <Label>{t('erp.accounting.form.referenceType', 'Reference Type')}</Label>
                <Select
                  value={journalReferenceType}
                  disabled={!!editingJournalEntry}
                  onValueChange={(v) => setJournalReferenceType(v as JournalReferenceType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="manual">{t('erp.accounting.referenceType.manual', 'Manual')}</SelectItem>
                    <SelectItem value="adjustment">{t('erp.accounting.referenceType.adjustment', 'Adjustment')}</SelectItem>
                    <SelectItem value="opening">{t('erp.accounting.referenceType.opening', 'Opening Balance')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t('erp.common.description', 'Description')}</Label>
              <Textarea data-tour="pages-erp-accounting.textarea.erp.accounting.form.journalDescriptionPlaceholder"
                value={journalDescription}
                onChange={(e) => setJournalDescription(e.target.value)}
                placeholder={t('erp.accounting.form.journalDescriptionPlaceholder', 'Journal entry description...')}
              />
            </div>

            <div className="border rounded-lg">
              <Table data-tour="pages-erp-accounting.table.erp.accounting.table.account" erpSortable={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('erp.accounting.table.account', 'Account')}</TableHead>
                    <TableHead>{t('erp.accounting.table.debit', 'Debit')}</TableHead>
                    <TableHead>{t('erp.accounting.table.credit', 'Credit')}</TableHead>
                    <TableHead>{t('erp.common.description', 'Description')}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalLines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          value={line.accountId?.toString() || '0'}
                          onValueChange={(v) => {
                            const newLines = [...journalLines];
                            newLines[index].accountId = v === '0' ? 0 : parseInt(v);
                            setJournalLines(newLines);
                          }}
                        >
                          <SelectTrigger data-tour="pages-erp-accounting.selecttrigger.erp.accounting.form.selectAccount" className="w-48">
                            <SelectValue placeholder={t('erp.accounting.form.selectAccount', 'Select account')} />
                          </SelectTrigger>
                          <SelectContent searchable>
                            <SelectItem value="0">{t('erp.accounting.form.selectAccount', 'Select account')}</SelectItem>
                            {accounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id.toString()}>
                                {acc.accountCode} - {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input data-tour="pages-erp-accounting.input.erp.accounting.form.amountPlaceholder"
                          value={line.debit}
                          onChange={(e) => {
                            const newLines = [...journalLines];
                            newLines[index].debit = e.target.value;
                            newLines[index].credit = '';
                            setJournalLines(newLines);
                          }}
                          placeholder={t('erp.accounting.form.amountPlaceholder', '0.00')}
                        />
                      </TableCell>
                      <TableCell>
                        <Input data-tour="pages-erp-accounting.input.erp.accounting.form.amountPlaceholder"
                          value={line.credit}
                          onChange={(e) => {
                            const newLines = [...journalLines];
                            newLines[index].credit = e.target.value;
                            newLines[index].debit = '';
                            setJournalLines(newLines);
                          }}
                          placeholder={t('erp.accounting.form.amountPlaceholder', '0.00')}
                        />
                      </TableCell>
                      <TableCell>
                        <Input data-tour="pages-erp-accounting.input.erp.accounting.form.lineDescription"
                          value={line.description}
                          onChange={(e) => {
                            const newLines = [...journalLines];
                            newLines[index].description = e.target.value;
                            setJournalLines(newLines);
                          }}
                          placeholder={t('erp.accounting.form.lineDescription', 'Line description')}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setJournalLines(journalLines.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-2">
                <Button data-tour="pages-erp-accounting.button.erp.accounting.actions.addLine"
                  variant="outline"
                  size="sm"
                  onClick={() => setJournalLines([...journalLines, { accountId: 0, debit: '', credit: '', description: '' }])}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('erp.accounting.actions.addLine', 'Add Line')}
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center bg-muted p-3 rounded-lg">
              <div className="space-x-4">
                <span>{t('erp.accounting.totalDebits', 'Total Debits')}: <strong>{totalDebits.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</strong></span>
                <span>{t('erp.accounting.totalCredits', 'Total Credits')}: <strong>{totalCredits.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</strong></span>
              </div>
              <div>
                {isBalanced ? (
                  <Badge className="bg-green-100 text-green-800">{t('erp.accounting.balanced', 'Balanced')}</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800">{t('erp.accounting.unbalanced', 'Unbalanced')}: {(totalDebits - totalCredits).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</Badge>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-accounting.button.ui.common.cancel" variant="outline" onClick={() => setJournalDialogOpen(false)}>{t('ui.common.cancel', 'Cancel')}</Button>
            <Button data-tour="pages-erp-accounting.button.ui.common.error"
              onClick={() => {
                const validLines = journalLines.filter(l => l.accountId > 0 && (l.debit || l.credit));
                if (validLines.length === 0) {
                  toast({ title: t('ui.common.error', 'Error'), description: t('erp.accounting.errors.journalLineRequired', 'At least one valid journal line is required'), variant: 'destructive' });
                  return;
                }
                const payload = {
                  entry: {
                    date: journalEntryDate,
                    description: journalDescription || null,
                    referenceType: journalReferenceType,
                    referenceId: journalReferenceType === 'adjustment' ? journalReferenceId : null,
                  },
                  lines: validLines.map(l => ({ ...l, journalEntryId: 0 })),
                };
                if (editingJournalEntry) {
                  updateJournalEntryMutation.mutate({ id: editingJournalEntry.id, data: payload });
                } else {
                  createJournalEntryMutation.mutate(payload);
                }
              }}
              disabled={!isBalanced || createJournalEntryMutation.isPending || updateJournalEntryMutation.isPending || journalLines.filter(l => l.accountId > 0 && (l.debit || l.credit)).length === 0}
            >
              {(createJournalEntryMutation.isPending || updateJournalEntryMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingJournalEntry ? t('erp.accounting.actions.updateEntry', 'Update Entry') : t('erp.accounting.actions.createEntry', 'Create Entry')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Journal Entry Detail Sheet */}
      <Sheet open={!!selectedJournalEntry} onOpenChange={() => setSelectedJournalEntry(null)}>
        <SheetContent className="w-96">
          <SheetHeader>
            <SheetTitle>{t('erp.accounting.sheet.journalEntry', 'Journal Entry')} {selectedJournalEntry?.entryNumber}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {selectedJournalEntry && (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">{t('erp.common.date', 'Date')}:</div>
                  <div>{new Date(selectedJournalEntry.date).toLocaleDateString()}</div>
                  <div className="text-muted-foreground">{t('erp.common.status', 'Status')}:</div>
                  <div>
                    <Badge className={journalStatusColors[selectedJournalEntry.status]}>
                      {selectedJournalEntry.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">{t('erp.accounting.table.reference', 'Reference')}:</div>
                  <div>{selectedJournalEntry.referenceType} {selectedJournalEntry.referenceId ? `#${selectedJournalEntry.referenceId}` : ''}</div>
                </div>
                {selectedJournalEntry.description && (
                  <div>
                    <div className="text-sm text-muted-foreground">{t('erp.common.description', 'Description')}:</div>
                    <div className="text-sm">{selectedJournalEntry.description}</div>
                  </div>
                )}
                <div className="border rounded-lg mt-4">
                  <Table data-tour="pages-erp-accounting.table.erp.accounting.table.account">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.accounting.table.account', 'Account')}</TableHead>
                        <TableHead className="text-right">{t('erp.accounting.table.debit', 'Debit')}</TableHead>
                        <TableHead className="text-right">{t('erp.accounting.table.credit', 'Credit')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journalEntryDetail?.lines.map((line) => {
                        const account = accounts.find(a => a.id === line.accountId);
                        return (
                          <TableRow key={line.id}>
                            <TableCell className="text-sm">
                              {account ? `${account.accountCode} - ${account.name}` : t('erp.accounting.unknownAccount', 'Unknown Account')}
                            </TableCell>
                            <TableCell className="text-right">
                              {parseFloat(line.debit) > 0 ? parseFloat(line.debit).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {parseFloat(line.credit) > 0 ? parseFloat(line.credit).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
