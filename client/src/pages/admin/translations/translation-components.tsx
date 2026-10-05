import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus, Trash } from 'lucide-react';

export function AddTranslationKeyDialog({
  namespaceId,
  onSuccess
}: {
  namespaceId: number,
  onSuccess: () => void
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    key: '',
    description: '',
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('POST', '/api/admin/keys', {
        namespaceId,
        ...data,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.translations.create_key_failed', 'Failed to create translation key'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.translations.key_created', 'Translation key created'),
        description: t('admin.translations.key_created_desc', 'The translation key has been created successfully.'),
      });
      setFormData({ key: '', description: '' });
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
        <Button
          variant="brand"
          className="btn-brand-primary"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.translations.add_key', 'Add Translation Key')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('admin.translations.add_new_key', 'Add New Translation Key')}</DialogTitle>
          <DialogDescription>
            {t('admin.translations.add_key_desc', 'Add a new translation key to the selected namespace.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="key" className="text-right">
                {t('admin.translations.key_label', 'Key')}
              </Label>
              <Input
                id="key"
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.translations.key_placeholder', 'welcome_message')}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                {t('admin.translations.description_label', 'Description')}
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="col-span-3"
                placeholder={t('admin.translations.description_placeholder', 'Welcome message shown on the homepage')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              variant="brand"
              className="btn-brand-primary"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('admin.translations.creating', 'Creating...')}
                </>
              ) : (
                t('admin.translations.create_key_button', 'Create Key')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTranslationKeyButton({
  keyId,
  keyName,
  onSuccess
}: {
  keyId: number,
  keyName: string,
  onSuccess: () => void
}) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/admin/keys/${keyId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete translation key');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Translation key deleted',
        description: 'The translation key has been deleted successfully.',
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete the "${keyName}" translation key? This will delete all translations for this key.`)) {
      deleteMutation.mutate();
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={deleteMutation.isPending}
    >
      {deleteMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Trash className="h-4 w-4 mr-2" />
          Delete
        </>
      )}
    </Button>
  );
}
