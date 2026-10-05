import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Loader2, Edit, Download, Upload, Plus } from 'lucide-react';

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
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface TranslationKey {
  id: number;
  namespaceId: number;
  key: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export function AddLanguageDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    nativeName: '',
    flagIcon: '',
    isActive: true,
    isDefault: false,
    direction: 'ltr' as 'ltr' | 'rtl',
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('POST', '/api/admin/languages', data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.languages.create_failed', 'Failed to create language'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.languages.language_created', 'Language created'),
        description: t('admin.languages.language_created_desc', 'The language has been created successfully.'),
      });
      setOpen(false);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className='btn-brand-primary'>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.languages.add_language', 'Add Language')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('admin.languages.add_new_language', 'Add New Language')}</DialogTitle>
          <DialogDescription>
            {t('admin.languages.add_language_desc', 'Add a new language to your application.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="code" className="text-right">
                {t('admin.languages.code_label', 'Code')}
              </Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.languages.code_placeholder', 'en')}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                {t('admin.languages.name_label', 'Name')}
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.languages.name_placeholder', 'English')}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nativeName" className="text-right">
                {t('admin.languages.native_name_label', 'Native Name')}
              </Label>
              <Input
                id="nativeName"
                value={formData.nativeName}
                onChange={(e) => setFormData({ ...formData, nativeName: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.languages.native_name_placeholder', 'English')}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="flagIcon" className="text-right">
                {t('admin.languages.flag_icon_label', 'Flag Icon')}
              </Label>
              <Input
                id="flagIcon"
                value={formData.flagIcon}
                onChange={(e) => setFormData({ ...formData, flagIcon: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.languages.flag_icon_placeholder', '🇺🇸')}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="direction" className="text-right">
                {t('admin.languages.direction_label', 'Direction')}
              </Label>
              <Select
                value={formData.direction}
                onValueChange={(value) => setFormData({ ...formData, direction: value as 'ltr' | 'rtl' })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t('admin.languages.select_direction', 'Select direction')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">{t('admin.languages.ltr', 'Left to Right (LTR)')}</SelectItem>
                  <SelectItem value="rtl">{t('admin.languages.rtl', 'Right to Left (RTL)')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="isActive" className="text-right">
                {t('admin.languages.active_label', 'Active')}
              </Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="isActive">{t('admin.languages.enable_language', 'Enable this language')}</Label>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="isDefault" className="text-right">
                {t('admin.languages.default_label', 'Default')}
              </Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Switch
                  id="isDefault"
                  checked={formData.isDefault}
                  onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                />
                <Label htmlFor="isDefault">{t('admin.languages.set_default', 'Set as default language')}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" variant="outline" className="btn-brand-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('admin.languages.creating', 'Creating...')}
                </>
              ) : (
                t('admin.languages.create_language', 'Create Language')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditLanguageDialog({
  language,
  onSuccess
}: {
  language: Language,
  onSuccess: () => void
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<{
    code: string;
    name: string;
    nativeName: string;
    flagIcon: string;
    isActive: boolean;
    direction: 'ltr' | 'rtl';
  }>({
    code: language.code,
    name: language.name,
    nativeName: language.nativeName,
    flagIcon: language.flagIcon || '',
    isActive: language.isActive ?? true,
    direction: (language.direction ?? 'ltr') as 'ltr' | 'rtl',
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('PUT', `/api/admin/languages/${language.id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.languages.update_failed', 'Failed to update language'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.languages.language_updated', 'Language updated'),
        description: t('admin.languages.language_updated_desc', 'The language has been updated successfully.'),
      });
      setOpen(false);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('admin.languages.edit_language', 'Edit Language')}</DialogTitle>
          <DialogDescription>
            {t('admin.languages.edit_language_desc', 'Update the language settings.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="code" className="text-right">
                {t('admin.languages.code_label', 'Code')}
              </Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.languages.code_placeholder', 'en')}
                required
                disabled={language.isDefault ?? false}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                {t('admin.languages.name_label', 'Name')}
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.languages.name_placeholder', 'English')}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nativeName" className="text-right">
                {t('admin.languages.native_name_label', 'Native Name')}
              </Label>
              <Input
                id="nativeName"
                value={formData.nativeName}
                onChange={(e) => setFormData({ ...formData, nativeName: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.languages.native_name_placeholder', 'English')}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="flagIcon" className="text-right">
                {t('admin.languages.flag_icon_label', 'Flag Icon')}
              </Label>
              <Input
                id="flagIcon"
                value={formData.flagIcon}
                onChange={(e) => setFormData({ ...formData, flagIcon: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.languages.flag_icon_placeholder', '🇺🇸')}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="direction" className="text-right">
                {t('admin.languages.direction_label', 'Direction')}
              </Label>
              <Select
                value={formData.direction}
                onValueChange={(value) => setFormData({ ...formData, direction: value as 'ltr' | 'rtl' })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t('admin.languages.select_direction', 'Select direction')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">{t('admin.languages.ltr', 'Left to Right (LTR)')}</SelectItem>
                  <SelectItem value="rtl">{t('admin.languages.rtl', 'Right to Left (RTL)')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="isActive" className="text-right">
                {t('admin.languages.active_label', 'Active')}
              </Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  disabled={language.isDefault ?? false}
                />
                <Label htmlFor="isActive">{t('admin.languages.enable_language', 'Enable this language')}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" variant="outline" className="btn-brand-primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('admin.languages.updating', 'Updating...')}
                </>
              ) : (
                t('admin.languages.update_language', 'Update Language')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddNamespaceDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('POST', '/api/admin/namespaces', data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.namespaces.create_failed', 'Failed to create namespace'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.namespaces.namespace_created', 'Namespace created'),
        description: t('admin.namespaces.namespace_created_desc', 'The namespace has been created successfully.'),
      });
      setOpen(false);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand">
          <Loader2 className="mr-2 h-4 w-4" />
          {t('admin.namespaces.add_namespace', 'Add Namespace')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('admin.namespaces.create_namespace', 'Create Namespace')}</DialogTitle>
          <DialogDescription>
            {t('admin.namespaces.add_namespace_desc', 'Create a new namespace for organizing translations.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                {t('admin.namespaces.name_label', 'Name')}
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.namespaces.name_placeholder', 'common')}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                {t('admin.namespaces.description_label', 'Description')}
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.namespaces.description_placeholder', 'Common translations used throughout the application')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" variant="outline" className="btn-brand-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('admin.namespaces.creating', 'Creating...')}
                </>
              ) : (
                t('admin.namespaces.create_namespace', 'Create Namespace')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExportTranslationsButton({ languageCode }: { languageCode?: string }) {
  const { t } = useTranslation();
  if (!languageCode) return null;

  const handleExport = (format: 'array' | 'nested') => {
    const url = `/api/admin/translations/export/${languageCode}?format=${format}`;
    window.open(url, '_blank');
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="brand"
        onClick={() => handleExport('array')}
        className="border-primary/30 hover:border-primary"
      >
        <Download className="mr-2 h-4 w-4" />
        {t('admin.translations.export_array', 'Export Array')}
      </Button>
      <Button
        variant="outline"
        onClick={() => handleExport('nested')}
        className="border-primary/30 hover:border-primary"
      >
        <Download className="mr-2 h-4 w-4" />
        {t('admin.translations.export_nested', 'Export Nested')}
      </Button>
    </div>
  );
}

export function ImportTranslationsDialog({
  languages,
  onSuccess
}: {
  languages: Language[],
  onSuccess: () => void
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file || !selectedLanguage) {
        throw new Error(t('admin.translations.select_file_language', 'Please select a language and a file'));
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/admin/translations/import/${selectedLanguage}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.translations.import_failed', 'Failed to import translations'));
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.translations.translations_imported', 'Translations imported'),
        description: t('admin.translations.translations_imported_desc', 'The translations have been imported successfully.'),
      });
      setOpen(false);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    importMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand">
          <Upload className="mr-2 h-4 w-4" />
          {t('admin.translations.import_translations', 'Import Translations')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('admin.translations.import_translations', 'Import Translations')}</DialogTitle>
          <DialogDescription>
            {t('admin.translations.import_translations_desc', 'Import translations from a JSON file. Supports both array format and nested format.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="language" className="text-right">
                {t('admin.translations.language_label', 'Language')}
              </Label>
              <Select
                value={selectedLanguage}
                onValueChange={setSelectedLanguage}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t('admin.translations.select_language', 'Select language')} />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((language) => (
                    <SelectItem key={language.id} value={language.id.toString()}>
                      {language.flagIcon && <span className="mr-2">{language.flagIcon}</span>}
                      {language.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="file" className="text-right">
                {t('admin.translations.file_label', 'File')}
              </Label>
              <Input
                id="file"
                type="file"
                accept=".json"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="col-span-3"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" variant="outline" className="btn-brand-primary" disabled={importMutation.isPending || !file || !selectedLanguage}>
              {importMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('admin.translations.importing', 'Importing...')}
                </>
              ) : (
                t('admin.translations.import_translations', 'Import Translations')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
