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
import { Loader2, Plus, Trash, Edit, Save } from 'lucide-react';
import { EditLanguageDialog } from './components';
import { AddTranslationKeyDialog, DeleteTranslationKeyButton } from './translation-components';

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

interface Translation {
  id: number;
  keyId: number;
  languageId: number;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export function LanguagesTab({
  languages,
  isLoading,
  onRefresh
}: {
  languages: Language[],
  isLoading: boolean,
  onRefresh: () => void
}) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/admin/languages/${id}/default`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to set default language');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.languages.default_updated_title', 'Default language updated'),
        description: t('admin.languages.default_updated_desc', 'The default language has been updated successfully.'),
      });
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/admin/languages/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete language');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.languages.deleted_title', 'Language deleted'),
        description: t('admin.languages.deleted_desc', 'The language has been deleted successfully.'),
      });
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<Language> }) => {
      const res = await apiRequest('PUT', `/api/admin/languages/${id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update language');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.languages.updated_title', 'Language updated'),
        description: t('admin.languages.updated_desc', 'The language has been updated successfully.'),
      });
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.languages.title', 'Available Languages')}</CardTitle>
        <CardDescription>
          {t('admin.languages.description', 'Manage the languages available in your application. The default language will be used when a user\'s preferred language is not available.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.languages.table.language', 'Language')}</TableHead>
              <TableHead>{t('admin.languages.table.code', 'Code')}</TableHead>
              <TableHead>{t('admin.languages.table.direction', 'Direction')}</TableHead>
              <TableHead>{t('admin.languages.table.active', 'Active')}</TableHead>
              <TableHead>{t('admin.languages.table.default', 'Default')}</TableHead>
              <TableHead className="text-right">{t('admin.languages.table.actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {languages.map((language) => (
              <TableRow key={language.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center">
                    {language.flagIcon && <span className="mr-2">{language.flagIcon}</span>}
                    <span>{language.name} ({language.nativeName})</span>
                  </div>
                </TableCell>
                <TableCell>{language.code}</TableCell>
                <TableCell>{(language.direction ?? 'ltr').toUpperCase()}</TableCell>
                <TableCell>
                  <Switch
                    checked={language.isActive ?? false}
                    onCheckedChange={(checked) => {
                      updateMutation.mutate({ id: language.id, data: { isActive: checked } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={language.isDefault ?? false}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setDefaultMutation.mutate(language.id);
                      }
                    }}
                    disabled={language.isDefault ?? false}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <EditLanguageDialog
                      language={language}
                      onSuccess={onRefresh}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        if (language.isDefault) {
                          toast({
                            title: t('admin.languages.cannot_delete_default_title', 'Cannot delete default language'),
                            description: t('admin.languages.cannot_delete_default_desc', 'Please set another language as default first.'),
                            variant: 'destructive',
                          });
                          return;
                        }
                        if (confirm(t('admin.languages.confirm_delete', 'Are you sure you want to delete {{name}}?', { name: language.name }))) {
                          deleteMutation.mutate(language.id);
                        }
                      }}
                      disabled={language.isDefault || deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}


export function NamespacesTab({
  namespaces,
  isLoading,
  onRefresh
}: {
  namespaces: Namespace[],
  isLoading: boolean,
  onRefresh: () => void
}) {
  const { toast } = useToast();
  const { t } = useTranslation();


  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/admin/namespaces/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete namespace');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.namespaces.deleted_title', 'Namespace deleted'),
        description: t('admin.namespaces.deleted_desc', 'The namespace has been deleted successfully.'),
      });
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.namespaces.title', 'Translation Namespaces')}</CardTitle>
        <CardDescription>
          {t('admin.namespaces.description', 'Namespaces help organize translations into logical groups.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.namespaces.table.name', 'Name')}</TableHead>
              <TableHead>{t('admin.namespaces.table.description', 'Description')}</TableHead>
              <TableHead className="text-right">{t('admin.namespaces.table.actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {namespaces.map((namespace) => (
              <TableRow key={namespace.id}>
                <TableCell className="font-medium">{namespace.name}</TableCell>
                <TableCell>{namespace.description}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <EditNamespaceDialog
                      namespace={namespace}
                      onSuccess={onRefresh}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        if (confirm(t('admin.namespaces.confirm_delete', 'Are you sure you want to delete the "{{name}}" namespace? This will delete all keys and translations in this namespace.', { name: namespace.name }))) {
                          deleteMutation.mutate(namespace.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}


function EditNamespaceDialog({
  namespace,
  onSuccess
}: {
  namespace: Namespace,
  onSuccess: () => void
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: namespace.name,
    description: namespace.description || '',
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('PUT', `/api/admin/namespaces/${namespace.id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update namespace');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.namespaces.updated_title', 'Namespace updated'),
        description: t('admin.namespaces.updated_desc', 'The namespace has been updated successfully.'),
      });
      setOpen(false);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
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
          <DialogTitle>{t('admin.namespaces.edit_title', 'Edit Namespace')}</DialogTitle>
          <DialogDescription>
            {t('admin.namespaces.edit_description', 'Update the namespace settings.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                {t('admin.namespaces.form.name', 'Name')}
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.namespaces.form.name_placeholder', 'common')}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                {t('admin.namespaces.form.description', 'Description')}
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.namespaces.form.description_placeholder', 'Common translations used throughout the application')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              variant="brand"
              className="btn-brand-primary"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.updating', 'Updating...')}
                </>
              ) : (
                t('admin.namespaces.update_button', 'Update Namespace')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


export function TranslationsTab({
  languages,
  namespaces,
  keys,
  translations,
  isLoadingLanguages,
  isLoadingNamespaces,
  isLoadingKeys,
  isLoadingTranslations,
  selectedLanguage,
  selectedNamespace,
  onSelectLanguage,
  onSelectNamespace,
  onRefresh
}: {
  languages: Language[],
  namespaces: Namespace[],
  keys: TranslationKey[],
  translations: Translation[],
  isLoadingLanguages: boolean,
  isLoadingNamespaces: boolean,
  isLoadingKeys: boolean,
  isLoadingTranslations: boolean,
  selectedLanguage: number | null,
  selectedNamespace: number | null,
  onSelectLanguage: (id: number | null) => void,
  onSelectNamespace: (id: number | null) => void,
  onRefresh: () => void
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [translationValues, setTranslationValues] = useState<Record<number, string>>({});
  const [isEditing, setIsEditing] = useState<Record<number, boolean>>({});


  const saveMutation = useMutation({
    mutationFn: async ({ keyId, value }: { keyId: number, value: string }) => {
      if (!selectedLanguage) {
        throw new Error('No language selected');
      }


      const existingTranslation = translations.find(t => t.keyId === keyId);

      if (existingTranslation) {

        const res = await apiRequest('PUT', `/api/admin/translations/${existingTranslation.id}`, {
          value
        });
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to update translation');
        }
        return res.json();
      } else {

        const res = await apiRequest('POST', '/api/admin/translations', {
          keyId,
          languageId: selectedLanguage,
          value
        });
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to create translation');
        }
        return res.json();
      }
    },
    onSuccess: (_, variables) => {
      toast({
        title: t('admin.translations.saved_title', 'Translation saved'),
        description: t('admin.translations.saved_desc', 'The translation has been saved successfully.'),
      });
      setIsEditing(prev => ({ ...prev, [variables.keyId]: false }));
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  useState(() => {
    const values: Record<number, string> = {};
    translations.forEach(translation => {
      values[translation.keyId] = translation.value;
    });
    setTranslationValues(values);
  });


  const handleTranslationChange = (keyId: number, value: string) => {
    setTranslationValues(prev => ({ ...prev, [keyId]: value }));
  };


  const handleSaveTranslation = (keyId: number) => {
    const value = translationValues[keyId] || '';
    saveMutation.mutate({ keyId, value });
  };

  if (isLoadingLanguages || isLoadingNamespaces) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.translations.title', 'Manage Translations')}</CardTitle>
        <CardDescription>
          {t('admin.translations.description', 'Select a language and namespace to manage translations.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <Label htmlFor="language">{t('admin.translations.language_label', 'Language')}</Label>
            <Select
              value={selectedLanguage?.toString() || ''}
              onValueChange={(value) => onSelectLanguage(value ? parseInt(value) : null)}
            >
              <SelectTrigger>
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
          <div>
            <Label htmlFor="namespace">{t('admin.translations.namespace_label', 'Namespace')}</Label>
            <Select
              value={selectedNamespace?.toString() || ''}
              onValueChange={(value) => onSelectNamespace(value ? parseInt(value) : null)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('admin.translations.select_namespace', 'Select namespace')} />
              </SelectTrigger>
              <SelectContent>
                {namespaces.map((namespace) => (
                  <SelectItem key={namespace.id} value={namespace.id.toString()}>
                    {namespace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedLanguage && selectedNamespace ? (
          isLoadingKeys || isLoadingTranslations ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <AddTranslationKeyDialog
                  namespaceId={selectedNamespace}
                  onSuccess={onRefresh}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.translations.table.key', 'Key')}</TableHead>
                    <TableHead>{t('admin.translations.table.translation', 'Translation')}</TableHead>
                    <TableHead className="text-right">{t('admin.translations.table.actions', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4">
                        {t('admin.translations.no_keys', 'No translation keys found in this namespace. Add a new key to get started.')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    keys.map((key) => {
                      const translation = translations.find(t => t.keyId === key.id);
                      const isEditingThis = isEditing[key.id] || false;
                      const value = translationValues[key.id] || translation?.value || '';

                      return (
                        <TableRow key={key.id}>
                          <TableCell className="font-medium">{key.key}</TableCell>
                          <TableCell>
                            {isEditingThis ? (
                              <Textarea
                                value={value}
                                onChange={(e) => handleTranslationChange(key.id, e.target.value)}
                                className="min-h-[100px]"
                              />
                            ) : (
                              <div className="whitespace-pre-wrap">{value || <em className="text-gray-400">{t('admin.translations.no_translation', 'No translation')}</em>}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {isEditingThis ? (
                                <Button
                                  variant="brand"
                                  size="sm"
                                  onClick={() => handleSaveTranslation(key.id)}
                                  disabled={saveMutation.isPending}
                                  className="btn-brand-primary"
                                >
                                  {saveMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  variant="brand"
                                  size="sm"
                                  onClick={() => setIsEditing(prev => ({ ...prev, [key.id]: true }))}
                                  className="border-primary/30 hover:border-primary"
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  {t('common.edit', 'Edit')}
                                </Button>
                              )}
                              <DeleteTranslationKeyButton
                                keyId={key.id}
                                keyName={key.key}
                                onSuccess={onRefresh}
                              />
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
          <div className="text-center py-8 text-gray-500">
            {t('admin.translations.select_both', 'Please select both a language and a namespace to manage translations.')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
