import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient, QueryKey } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  Plus,
  Download,
  Upload,
  Trash,
  Edit,
  Save,
  Globe,
  FolderTree as TabIconFolderTree,
  Languages as TabIconLanguages,
} from 'lucide-react';


interface Language {
  id: number;
  code: string;
  name: string;
  nativeName: string;
  flagIcon?: string | null;
  isActive: boolean | null;
  isDefault: boolean | null;
  direction: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Namespace {
  id: number;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TranslationKey {
  id: number;
  namespaceId: number;
  key: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Translation {
  id: number;
  keyId: number;
  languageId: number;
  value: string;
  createdAt: string;
  updatedAt: string;
}

interface LanguageFormData {
  code: string;
  name: string;
  nativeName: string;
  flagIcon: string;
  isActive: boolean;
  isDefault: boolean;
  direction: 'ltr' | 'rtl';
}

interface NamespaceFormData {
  name: string;
  description: string;
}

interface KeyFormData {
  key: string;
  description: string;
}

interface UpdateLanguagePayload {
  code?: string;
  name?: string;
  nativeName?: string;
  flagIcon?: string | null;
  direction?: 'ltr' | 'rtl';
  isActive?: boolean;
}

interface UpdateNamespacePayload {
  name?: string;
  description?: string | null;
}

interface CreateKeyPayload {
  namespaceId: number;
  key: string;
  description?: string;
}

interface SaveTranslationPayload {
  keyId: number;
  languageId: number;
  value: string;
}

interface ImportTranslationsPayload {
  languageId: string;
  file: File;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}


export default function TranslationsPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('languages');
  const [selectedLanguage, setSelectedLanguage] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<number | null>(null);

  const [languageForm, setLanguageForm] = useState<LanguageFormData>({
    code: '',
    name: '',
    nativeName: '',
    flagIcon: '',
    isActive: true,
    isDefault: false,
    direction: 'ltr' as const,
  });

  const [editLanguageForm, setEditLanguageForm] = useState<Language | null>(null);
  const [isEditLanguageDialogOpen, setIsEditLanguageDialogOpen] = useState(false);

  const [namespaceForm, setNamespaceForm] = useState<NamespaceFormData>({
    name: '',
    description: '',
  });

  const [editNamespaceForm, setEditNamespaceForm] = useState<Namespace | null>(null);
  const [isEditNamespaceDialogOpen, setIsEditNamespaceDialogOpen] = useState(false);

  const [keyForm, setKeyForm] = useState<KeyFormData>({
    key: '',
    description: '',
  });
  const [isAddKeyDialogOpen, setIsAddKeyDialogOpen] = useState(false);

  const [translationValues, setTranslationValues] = useState<Record<number, string>>({});
  const [isEditing, setIsEditing] = useState<Record<number, boolean>>({});

  const [importForm, setImportForm] = useState<{ languageId: string; file: File | null }>({
    languageId: '',
    file: null,
  });
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  useEffect(() => {
    if (!isLoadingAuth && user && !user.isSuperAdmin) {
      navigate('/');
    }
  }, [user, isLoadingAuth, navigate]);

  const languagesQueryKey: QueryKey = ['languages'];
  const {
    data: languages,
    isLoading: isLoadingLanguages,
  } = useQuery<Language[], Error>({
    queryKey: languagesQueryKey,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/languages');
      if (!res.ok) throw new Error('Failed to fetch languages');
      return res.json() as Promise<Language[]>;
    },
    enabled: !!user?.isSuperAdmin,
  });

  const namespacesQueryKey: QueryKey = ['namespaces'];
  const {
    data: namespaces,
    isLoading: isLoadingNamespaces,
  } = useQuery<Namespace[], Error>({
    queryKey: namespacesQueryKey,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/namespaces');
      if (!res.ok) throw new Error('Failed to fetch namespaces');
      return res.json() as Promise<Namespace[]>;
    },
    enabled: !!user?.isSuperAdmin,
  });

  const keysQueryKey: QueryKey = ['keys', selectedNamespace];
  const {
    data: keys,
    isLoading: isLoadingKeys,
  } = useQuery<TranslationKey[], Error>({
    queryKey: keysQueryKey,
    queryFn: async () => {
      if (!selectedNamespace) throw new Error("Namespace not selected");
      const res = await apiRequest('GET', `/api/keys?namespaceId=${selectedNamespace}`);
      if (!res.ok) throw new Error('Failed to fetch keys');
      return res.json() as Promise<TranslationKey[]>;
    },
    enabled: !!selectedNamespace && !!user?.isSuperAdmin,
  });

  const translationsQueryKey: QueryKey = ['translations', selectedLanguage, selectedNamespace];
  const {
    data: translations,
    isLoading: isLoadingTranslations,
  } = useQuery<Translation[], Error>({
    queryKey: translationsQueryKey,
    queryFn: async () => {
      if (!selectedLanguage || !selectedNamespace) throw new Error("Language or Namespace not selected");
      const res = await apiRequest('GET', `/api/translations?languageId=${selectedLanguage}&namespaceId=${selectedNamespace}`);
      if (!res.ok) throw new Error('Failed to fetch translations');
      return res.json() as Promise<Translation[]>;
    },
    enabled: !!selectedLanguage && !!selectedNamespace && !!user?.isSuperAdmin,
  });

  const handleApiError = async (res: Response, defaultMessage: string): Promise<Error> => {
    try {
      const errorBody = await res.json() as ApiErrorResponse;
      return new Error(errorBody.error || errorBody.message || defaultMessage);
    } catch (e) {

      return new Error(defaultMessage);
    }
  };

  const createLanguageMutation = useMutation<Language, Error, LanguageFormData>({
    mutationFn: async (data) => {
      const res = await apiRequest('POST', '/api/admin/languages', data);
      if (!res.ok) throw await handleApiError(res, 'Failed to create language');
      return res.json() as Promise<Language>;
    },
    onSuccess: () => {
      toast({ title: 'Language created', description: 'The language has been created successfully.' });
      setLanguageForm({ code: '', name: '', nativeName: '', flagIcon: '', isActive: true, isDefault: false, direction: 'ltr' });
      queryClient.invalidateQueries({ queryKey: languagesQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error creating language', description: error.message, variant: 'destructive' });
    },
  });

  const updateLanguageMutation = useMutation<Language, Error, { id: number; data: UpdateLanguagePayload }>({
    mutationFn: async ({ id, data }) => {
      const res = await apiRequest('PUT', `/api/admin/languages/${id}`, data);
      if (!res.ok) throw await handleApiError(res, 'Failed to update language');
      return res.json() as Promise<Language>;
    },
    onSuccess: () => {
      toast({ title: 'Language updated', description: 'The language has been updated successfully.' });
      setIsEditLanguageDialogOpen(false);
      setEditLanguageForm(null);
      queryClient.invalidateQueries({ queryKey: languagesQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error updating language', description: error.message, variant: 'destructive' });
    },
  });

  const deleteLanguageMutation = useMutation<unknown, Error, number>({
    mutationFn: async (id) => {
      const res = await apiRequest('DELETE', `/api/admin/languages/${id}`);
      if (!res.ok) throw await handleApiError(res, 'Failed to delete language');
      return res.json(); // Or handle 204 No Content if API returns that
    },
    onSuccess: () => {
      toast({ title: 'Language deleted', description: 'The language has been deleted successfully.' });
      queryClient.invalidateQueries({ queryKey: languagesQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error deleting language', description: error.message, variant: 'destructive' });
    },
  });

  const setDefaultLanguageMutation = useMutation<Language, Error, number>({
    mutationFn: async (id) => {
      const res = await apiRequest('POST', `/api/admin/languages/${id}/default`);
      if (!res.ok) throw await handleApiError(res, 'Failed to set default language');
      return res.json() as Promise<Language>;
    },
    onSuccess: () => {
      toast({ title: 'Default language updated', description: 'The default language has been updated successfully.' });
      queryClient.invalidateQueries({ queryKey: languagesQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error setting default language', description: error.message, variant: 'destructive' });
    },
  });

  const createNamespaceMutation = useMutation<Namespace, Error, NamespaceFormData>({
    mutationFn: async (data) => {
      const res = await apiRequest('POST', '/api/admin/namespaces', data);
      if (!res.ok) throw await handleApiError(res, 'Failed to create namespace');
      return res.json() as Promise<Namespace>;
    },
    onSuccess: () => {
      toast({ title: 'Namespace created', description: 'The namespace has been created successfully.' });
      setNamespaceForm({ name: '', description: '' });
      queryClient.invalidateQueries({ queryKey: namespacesQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error creating namespace', description: error.message, variant: 'destructive' });
    },
  });

  const updateNamespaceMutation = useMutation<Namespace, Error, { id: number; data: UpdateNamespacePayload }>({
    mutationFn: async ({ id, data }) => {
      const res = await apiRequest('PUT', `/api/admin/namespaces/${id}`, data);
      if (!res.ok) throw await handleApiError(res, 'Failed to update namespace');
      return res.json() as Promise<Namespace>;
    },
    onSuccess: () => {
      toast({ title: 'Namespace updated', description: 'The namespace has been updated successfully.' });
      setIsEditNamespaceDialogOpen(false);
      setEditNamespaceForm(null);
      queryClient.invalidateQueries({ queryKey: namespacesQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error updating namespace', description: error.message, variant: 'destructive' });
    },
  });

  const deleteNamespaceMutation = useMutation<unknown, Error, number>({
    mutationFn: async (id) => {
      const res = await apiRequest('DELETE', `/api/admin/namespaces/${id}`);
      if (!res.ok) throw await handleApiError(res, 'Failed to delete namespace');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Namespace deleted', description: 'The namespace has been deleted successfully.' });
      queryClient.invalidateQueries({ queryKey: namespacesQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error deleting namespace', description: error.message, variant: 'destructive' });
    },
  });

  const createKeyMutation = useMutation<TranslationKey, Error, CreateKeyPayload>({
    mutationFn: async (data) => {
      const res = await apiRequest('POST', '/api/admin/keys', data);
      if (!res.ok) throw await handleApiError(res, 'Failed to create translation key');
      return res.json() as Promise<TranslationKey>;
    },
    onSuccess: () => {
      toast({ title: 'Translation key created', description: 'The translation key has been created successfully.' });
      setKeyForm({ key: '', description: '' });
      setIsAddKeyDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: keysQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error creating key', description: error.message, variant: 'destructive' });
    },
  });

  const deleteKeyMutation = useMutation<unknown, Error, number>({
    mutationFn: async (id) => {
      const res = await apiRequest('DELETE', `/api/admin/keys/${id}`);
      if (!res.ok) throw await handleApiError(res, 'Failed to delete translation key');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Translation key deleted', description: 'The translation key has been deleted successfully.' });
      queryClient.invalidateQueries({ queryKey: keysQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error deleting key', description: error.message, variant: 'destructive' });
    },
  });

  const saveTranslationMutation = useMutation<Translation, Error, SaveTranslationPayload>({
    mutationFn: async ({ keyId, languageId, value }) => {
      const existingTranslation = translations?.find(t => t.keyId === keyId && t.languageId === languageId);
      let res: Response;
      if (existingTranslation) {
        res = await apiRequest('PUT', `/api/admin/translations/${existingTranslation.id}`, { value });
        if (!res.ok) throw await handleApiError(res, 'Failed to update translation');
      } else {
        res = await apiRequest('POST', '/api/admin/translations', { keyId, languageId, value });
        if (!res.ok) throw await handleApiError(res, 'Failed to create translation');
      }
      return res.json() as Promise<Translation>;
    },
    onSuccess: (_, variables) => {
      toast({ title: 'Translation saved', description: 'The translation has been saved successfully.' });
      setIsEditing(prev => ({ ...prev, [variables.keyId]: false }));
      queryClient.invalidateQueries({ queryKey: translationsQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error saving translation', description: error.message, variant: 'destructive' });
    },
  });

  const importTranslationsMutation = useMutation<unknown, Error, ImportTranslationsPayload>({
    mutationFn: async ({ languageId, file }) => {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/admin/translations/import/${languageId}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) throw await handleApiError(res, 'Failed to import translations');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Translations imported', description: 'The translations have been imported successfully.' });
      setImportForm({ languageId: '', file: null });
      setIsImportDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: translationsQueryKey });
      queryClient.invalidateQueries({ queryKey: keysQueryKey });
    },
    onError: (error) => {
      toast({ title: 'Error importing translations', description: error.message, variant: 'destructive' });
    },
  });
  
  const handleLanguageFormInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setLanguageForm(prev => ({ ...prev, [id]: value }));
  };

  const handleLanguageFormSwitchChange = (id: keyof LanguageFormData, checked: boolean) => {
    setLanguageForm(prev => ({ ...prev, [id]: checked }));
  };
  
  const handleEditLanguageFormInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editLanguageForm) return;
    const { id, value } = e.target;
    const fieldName = id.replace(/^edit-/, '') as keyof Language; // remove "edit-" prefix
    setEditLanguageForm(prev => prev ? { ...prev, [fieldName]: value } : null);
  };

  const handleEditLanguageFormSwitchChange = (fieldName: keyof Language, checked: boolean) => {
     if (!editLanguageForm) return;
    setEditLanguageForm(prev => prev ? { ...prev, [fieldName]: checked } : null);
  };

  const handleNamespaceFormInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setNamespaceForm(prev => ({ ...prev, [id]: value }));
  };

  const handleEditNamespaceFormInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editNamespaceForm) return;
    const { id, value } = e.target;
    const fieldName = id.replace(/^edit-namespace-/, '') as keyof Namespace;
    setEditNamespaceForm(prev => prev ? { ...prev, [fieldName]: value } : null);
  };

  const handleKeyFormInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setKeyForm(prev => ({ ...prev, [id]: value }));
  };


  if (isLoadingAuth || (user && !user.isSuperAdmin)) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full"> {/* Use h-full if AdminLayout provides height */}
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          <h1 className="text-2xl">Languages & Translations</h1>
          <div className="flex gap-2">
            {activeTab === 'languages' && (
              <Dialog onOpenChange={(open) => { if(open) setLanguageForm({ code: '', name: '', nativeName: '', flagIcon: '', isActive: true, isDefault: false, direction: 'ltr' }); }}>
                <DialogTrigger asChild>
                  <Button className='btn-brand-primary'>
                    <Plus className="mr-2 h-4 w-4" /> Add Language
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Add New Language</DialogTitle>
                    <DialogDescription>Add a new language to your application.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); createLanguageMutation.mutate(languageForm); }}>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="code" className="text-right">Code</Label>
                        <Input id="code" value={languageForm.code} onChange={handleLanguageFormInputChange} className="col-span-3" placeholder="en" required />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Name</Label>
                        <Input id="name" value={languageForm.name} onChange={handleLanguageFormInputChange} className="col-span-3" placeholder="English" required />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="nativeName" className="text-right">Native Name</Label>
                        <Input id="nativeName" value={languageForm.nativeName} onChange={handleLanguageFormInputChange} className="col-span-3" placeholder="English" required />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="flagIcon" className="text-right">Flag Icon</Label>
                        <Input id="flagIcon" value={languageForm.flagIcon} onChange={handleLanguageFormInputChange} className="col-span-3" placeholder="🇺🇸" />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="direction" className="text-right">Direction</Label>
                        <Select value={languageForm.direction} onValueChange={(value) => setLanguageForm(prev => ({ ...prev, direction: value as 'ltr' | 'rtl' }))}>
                          <SelectTrigger className="col-span-3" id="direction"><SelectValue placeholder="Select direction" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ltr">Left to Right (LTR)</SelectItem>
                            <SelectItem value="rtl">Right to Left (RTL)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="isActive" className="text-right">Active</Label>
                        <div className="col-span-3 flex items-center space-x-2">
                          <Switch id="isActive" checked={languageForm.isActive} onCheckedChange={(checked) => handleLanguageFormSwitchChange('isActive', checked)} />
                          <Label htmlFor="isActive">Enable this language</Label>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="isDefault" className="text-right">Default</Label>
                        <div className="col-span-3 flex items-center space-x-2">
                          <Switch id="isDefault" checked={languageForm.isDefault} onCheckedChange={(checked) => handleLanguageFormSwitchChange('isDefault', checked)} />
                          <Label htmlFor="isDefault">Set as default language</Label>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" variant="outline" className="btn-brand-primary" disabled={createLanguageMutation.isPending}>
                        {createLanguageMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>) : ('Create Language')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {activeTab === 'namespaces' && (
              <Dialog onOpenChange={(open) => {if(open) setNamespaceForm({ name: '', description: '' });}}>
                <DialogTrigger asChild>
                  <Button className='btn-brand-primary'>
                    <Plus className="mr-2 h-4 w-4" /> Add Namespace
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader><DialogTitle>Add New Namespace</DialogTitle><DialogDescription>Add a new namespace to organize your translations.</DialogDescription></DialogHeader>
                  <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); createNamespaceMutation.mutate(namespaceForm); }}>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Name</Label>
                        <Input id="name" value={namespaceForm.name} onChange={handleNamespaceFormInputChange} className="col-span-3" placeholder="common" required />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">Description</Label>
                        <Textarea id="description" value={namespaceForm.description} onChange={handleNamespaceFormInputChange} className="col-span-3" placeholder="Common translations used throughout the application" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" variant="outline" className="btn-brand-primary" disabled={createNamespaceMutation.isPending}>
                        {createNamespaceMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>) : ('Create Namespace')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {activeTab === 'translations' && (
              <>
                <Dialog open={isImportDialogOpen} onOpenChange={(open) => { setIsImportDialogOpen(open); if(open) setImportForm({ languageId: '', file: null });}}>
                  <DialogTrigger asChild>
                    <Button variant="brand" className="border-primary/30 hover:border-primary"><Upload className="mr-2 h-4 w-4" />Import Translations</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader><DialogTitle>Import Translations</DialogTitle><DialogDescription>Import translations from a JSON file.</DialogDescription></DialogHeader>
                    <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
                      e.preventDefault();
                      if (importForm.file && importForm.languageId) {
                        importTranslationsMutation.mutate({ languageId: importForm.languageId, file: importForm.file });
                      }
                    }}>
                      <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="import-language" className="text-right">Language</Label>
                          <Select value={importForm.languageId} onValueChange={(value) => setImportForm(prev => ({ ...prev, languageId: value }))}>
                            <SelectTrigger className="col-span-3" id="import-language"><SelectValue placeholder="Select language" /></SelectTrigger>
                            <SelectContent>
                              {languages?.map((language) => (
                                <SelectItem key={language.id} value={language.id.toString()}>
                                  {language.flagIcon && <span className="mr-2">{language.flagIcon}</span>}{language.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="import-file" className="text-right">File</Label>
                          <Input id="import-file" type="file" accept=".json" onChange={(e: ChangeEvent<HTMLInputElement>) => setImportForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))} className="col-span-3" required />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={importTranslationsMutation.isPending || !importForm.file || !importForm.languageId} variant="brand" className="btn-brand-primary">
                          {importTranslationsMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing...</>) : ('Import Translations')}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
                {selectedLanguage && (
                  <Button variant="brand" onClick={() => {
                      const languageCode = languages?.find(l => l.id === selectedLanguage)?.code;
                      if (languageCode) window.open(`/api/admin/translations/export/${languageCode}`, '_blank');
                    }} className="btn-brand-primary">
                    <Download className="mr-2 h-4 w-4" /> Export Translations
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger icon={TabIconLanguages} value="languages">Languages</TabsTrigger>
            <TabsTrigger icon={TabIconFolderTree} value="namespaces">Namespaces</TabsTrigger>
            <TabsTrigger icon={TabIconLanguages} value="translations">Translations</TabsTrigger>
          </TabsList>

          <TabsContent value="languages">
            <Card>
              <CardHeader><CardTitle>Available Languages</CardTitle><CardDescription>Manage the languages available in your application.</CardDescription></CardHeader>
              <CardContent>
                {isLoadingLanguages ? (<div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Language</TableHead><TableHead>Code</TableHead><TableHead>Direction</TableHead><TableHead>Active</TableHead><TableHead>Default</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {languages?.map((language) => (
                        <TableRow key={language.id}>
                          <TableCell className="font-medium"><div className="flex items-center">{language.flagIcon && <span className="mr-2">{language.flagIcon}</span>}<span>{language.name} ({language.nativeName})</span></div></TableCell>
                          <TableCell>{language.code}</TableCell>
                          <TableCell>{(language.direction ?? 'ltr').toUpperCase()}</TableCell>
                          <TableCell>
                            <Switch checked={language.isActive ?? false} onCheckedChange={(checked) => updateLanguageMutation.mutate({ id: language.id, data: { isActive: checked } })} disabled={language.isDefault ?? false} />
                          </TableCell>
                          <TableCell>
                            <Switch checked={language.isDefault ?? false} onCheckedChange={(checked) => { if (checked) setDefaultLanguageMutation.mutate(language.id); }} disabled={language.isDefault ?? false} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Dialog open={isEditLanguageDialogOpen && editLanguageForm?.id === language.id}
                                onOpenChange={(open) => {
                                  setIsEditLanguageDialogOpen(open);
                                  if (!open) setEditLanguageForm(null);
                                  else setEditLanguageForm(language); // Pre-fill form when opening
                                }}>
                                <DialogTrigger asChild>
                                  <Button variant="brand" size="icon"><Edit className="h-4 w-4" /></Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                  <DialogHeader><DialogTitle>Edit Language</DialogTitle><DialogDescription>Update the language settings.</DialogDescription></DialogHeader>
                                  {editLanguageForm && (
                                    <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
                                      e.preventDefault();
                                      const payload: UpdateLanguagePayload = {
                                          code: editLanguageForm.code,
                                          name: editLanguageForm.name,
                                          nativeName: editLanguageForm.nativeName,
                                          flagIcon: editLanguageForm.flagIcon || '',
                                          direction: (editLanguageForm.direction ?? 'ltr') as 'ltr' | 'rtl',
                                          isActive: editLanguageForm.isActive ?? true,
                                      };
                                      updateLanguageMutation.mutate({ id: editLanguageForm.id, data: payload });
                                    }}>
                                      <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                          <Label htmlFor="edit-code" className="text-right">Code</Label>
                                          <Input id="edit-code" value={editLanguageForm.code} onChange={handleEditLanguageFormInputChange} className="col-span-3" placeholder="en" required disabled={editLanguageForm.isDefault ?? false} />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                          <Label htmlFor="edit-name" className="text-right">Name</Label>
                                          <Input id="edit-name" value={editLanguageForm.name} onChange={handleEditLanguageFormInputChange} className="col-span-3" placeholder="English" required />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                          <Label htmlFor="edit-nativeName" className="text-right">Native Name</Label>
                                          <Input id="edit-nativeName" value={editLanguageForm.nativeName} onChange={handleEditLanguageFormInputChange} className="col-span-3" placeholder="English" required />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                          <Label htmlFor="edit-flagIcon" className="text-right">Flag Icon</Label>
                                          <Input id="edit-flagIcon" value={editLanguageForm.flagIcon || ''} onChange={handleEditLanguageFormInputChange} className="col-span-3" placeholder="🇺🇸" />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                          <Label htmlFor="edit-direction" className="text-right">Direction</Label>
                                          <Select
                                            value={editLanguageForm.direction ?? 'ltr'}
                                            onValueChange={(value) =>
                                              setEditLanguageForm(prev =>
                                                prev ? { ...prev, direction: value as 'ltr' | 'rtl' } : null
                                              )
                                            }
                                          >
                                            <SelectTrigger className="col-span-3" id="edit-direction"><SelectValue placeholder="Select direction" /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="ltr">Left to Right (LTR)</SelectItem>
                                              <SelectItem value="rtl">Right to Left (RTL)</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                          <Label htmlFor="edit-isActive" className="text-right">Active</Label>
                                          <div className="col-span-3 flex items-center space-x-2">
                                            <Switch id="edit-isActive" checked={editLanguageForm.isActive ?? false} onCheckedChange={(checked) => handleEditLanguageFormSwitchChange('isActive', checked)} disabled={editLanguageForm.isDefault ?? false} />
                                            <Label htmlFor="edit-isActive">Enable this language</Label>
                                          </div>
                                        </div>
                                      </div>
                                      <DialogFooter>
                                        <Button type="submit" variant="outline" className="btn-brand-primary" disabled={updateLanguageMutation.isPending}>
                                          {updateLanguageMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>) : ('Update Language')}
                                        </Button>
                                      </DialogFooter>
                                    </form>
                                  )}
                                </DialogContent>
                              </Dialog>
                              <Button variant="destructive" size="icon" onClick={() => {
                                  if (language.isDefault) {
                                    toast({ title: 'Cannot delete default language', description: 'Please set another language as default first.', variant: 'destructive' }); return;
                                  }
                                  if (window.confirm(`Are you sure you want to delete ${language.name}?`)) deleteLanguageMutation.mutate(language.id);
                                }} disabled={language.isDefault || deleteLanguageMutation.isPending}>
                                {deleteLanguageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                              </Button>
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

          <TabsContent value="namespaces">
            <Card>
              <CardHeader><CardTitle>Translation Namespaces</CardTitle><CardDescription>Namespaces help organize translations.</CardDescription></CardHeader>
              <CardContent>
                {isLoadingNamespaces ? (<div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {namespaces?.map((namespace) => (
                        <TableRow key={namespace.id}>
                          <TableCell className="font-medium">{namespace.name}</TableCell>
                          <TableCell>{namespace.description || '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Dialog open={isEditNamespaceDialogOpen && editNamespaceForm?.id === namespace.id}
                                onOpenChange={(open) => {
                                  setIsEditNamespaceDialogOpen(open);
                                  if (!open) setEditNamespaceForm(null);
                                  else setEditNamespaceForm(namespace);
                                }}>
                                <DialogTrigger asChild>
                                  <Button variant="brand" size="icon"><Edit className="h-4 w-4" /></Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                  <DialogHeader><DialogTitle>Edit Namespace</DialogTitle><DialogDescription>Update the namespace settings.</DialogDescription></DialogHeader>
                                  {editNamespaceForm && (
                                    <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
                                      e.preventDefault();
                                      const payload: UpdateNamespacePayload = {
                                          name: editNamespaceForm.name,
                                          description: editNamespaceForm.description || '',
                                      };
                                      updateNamespaceMutation.mutate({ id: editNamespaceForm.id, data: payload });
                                    }}>
                                      <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                          <Label htmlFor="edit-namespace-name" className="text-right">Name</Label>
                                          <Input id="edit-namespace-name" value={editNamespaceForm.name} onChange={handleEditNamespaceFormInputChange} className="col-span-3" placeholder="common" required />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                          <Label htmlFor="edit-namespace-description" className="text-right">Description</Label>
                                          <Textarea id="edit-namespace-description" value={editNamespaceForm.description || ''} onChange={handleEditNamespaceFormInputChange} className="col-span-3" placeholder="Common translations" />
                                        </div>
                                      </div>
                                      <DialogFooter>
                                        <Button type="submit" variant="outline" className="btn-brand-primary" disabled={updateNamespaceMutation.isPending}>
                                          {updateNamespaceMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>) : ('Update Namespace')}
                                        </Button>
                                      </DialogFooter>
                                    </form>
                                  )}
                                </DialogContent>
                              </Dialog>
                              <Button variant="destructive" size="icon" onClick={() => {
                                  if (window.confirm(`Are you sure you want to delete the "${namespace.name}" namespace? This will delete all keys and translations in this namespace.`)) deleteNamespaceMutation.mutate(namespace.id);
                                }} disabled={deleteNamespaceMutation.isPending}>
                                {deleteNamespaceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                              </Button>
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

          <TabsContent value="translations">
            <Card>
              <CardHeader><CardTitle>Manage Translations</CardTitle><CardDescription>Select a language and namespace to manage translations.</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <Label htmlFor="language-select">Language</Label>
                    <Select value={selectedLanguage?.toString() || ''} onValueChange={(value) => setSelectedLanguage(value ? parseInt(value) : null)}>
                      <SelectTrigger id="language-select"><SelectValue placeholder="Select language" /></SelectTrigger>
                      <SelectContent>
                        {languages?.map((language) => (
                          <SelectItem key={language.id} value={language.id.toString()}>
                            {language.flagIcon && <span className="mr-2">{language.flagIcon}</span>}{language.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="namespace-select">Namespace</Label>
                    <Select value={selectedNamespace?.toString() || ''} onValueChange={(value) => setSelectedNamespace(value ? parseInt(value) : null)}>
                      <SelectTrigger id="namespace-select"><SelectValue placeholder="Select namespace" /></SelectTrigger>
                      <SelectContent>
                        {namespaces?.map((namespace) => (
                          <SelectItem key={namespace.id} value={namespace.id.toString()}>{namespace.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedLanguage && selectedNamespace ? (
                  isLoadingKeys || isLoadingTranslations ? (<div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>) : (
                    <>
                      <div className="flex justify-end mb-4">
                        <Dialog open={isAddKeyDialogOpen} onOpenChange={(open) => {setIsAddKeyDialogOpen(open); if(open) setKeyForm({ key: '', description: ''});}}>
                          <DialogTrigger asChild>
                            <Button variant="brand" className="btn-brand-primary"><Plus className="mr-2 h-4 w-4" />Add Translation Key</Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader><DialogTitle>Add Translation Key</DialogTitle><DialogDescription>Add a new translation key to the selected namespace.</DialogDescription></DialogHeader>
                            <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
                              e.preventDefault();
                              if (selectedNamespace) {
                                createKeyMutation.mutate({ namespaceId: selectedNamespace, key: keyForm.key, description: keyForm.description || undefined });
                              }
                            }}>
                              <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                  <Label htmlFor="key" className="text-right">Key</Label>
                                  <Input id="key" value={keyForm.key} onChange={handleKeyFormInputChange} className="col-span-3" placeholder="welcome.message" required />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                  <Label htmlFor="description" className="text-right">Description</Label>
                                  <Textarea id="description" value={keyForm.description} onChange={handleKeyFormInputChange} className="col-span-3" placeholder="Welcome message shown on the homepage" />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button type="submit" variant="outline" className="btn-brand-primary" disabled={createKeyMutation.isPending}>
                                  {createKeyMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>) : ('Create Key')}
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <Table>
                        <TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Translation</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {keys?.length === 0 ? (
                            <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No translation keys found in this namespace.</TableCell></TableRow>
                          ) : (
                            keys?.map((keyItem) => { // Renamed key to keyItem to avoid conflict with React key prop
                              const translation = translations?.find(t => t.keyId === keyItem.id);
                              const isEditingThis = isEditing[keyItem.id] || false;
                              const currentValue = translationValues[keyItem.id] !== undefined ? translationValues[keyItem.id] : (translation?.value || '');

                              return (
                                <TableRow key={keyItem.id}>
                                  <TableCell className="font-medium">{keyItem.key}</TableCell>
                                  <TableCell>
                                    {isEditingThis ? (
                                      <Textarea value={currentValue} onChange={(e) => setTranslationValues(prev => ({ ...prev, [keyItem.id]: e.target.value }))} className="min-h-[100px]" />
                                    ) : (
                                      <div className="whitespace-pre-wrap">{currentValue || <em className="text-muted-foreground">No translation</em>}</div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                      {isEditingThis ? (
                                        <Button variant="brand" size="icon" onClick={() => {
                                            if (selectedLanguage) {
                                              saveTranslationMutation.mutate({ keyId: keyItem.id, languageId: selectedLanguage, value: translationValues[keyItem.id] || '' });
                                            }
                                          }} disabled={saveTranslationMutation.isPending}>
                                          {saveTranslationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        </Button>
                                      ) : (
                                        <Button variant="brand" size="icon" onClick={() => {
                                            setIsEditing(prev => ({ ...prev, [keyItem.id]: true }));
                                            if (translationValues[keyItem.id] === undefined) { // Pre-fill only if not already being edited
                                               setTranslationValues(prev => ({ ...prev, [keyItem.id]: translation?.value || '' }));
                                            }
                                          }}>
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                      )}
                                      <Button variant="destructive" size="icon" onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete the "${keyItem.key}" translation key? This will delete all translations for this key.`)) deleteKeyMutation.mutate(keyItem.id);
                                        }} disabled={deleteKeyMutation.isPending}>
                                        {deleteKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </>
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">Please select both a language and a namespace to manage translations.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}