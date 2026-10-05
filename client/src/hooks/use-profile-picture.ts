import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useTranslation } from "@/hooks/use-translation";

export function useProfilePicture() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateProfilePictureMutation = useMutation({
    mutationFn: async ({ contactId, connectionId, channelType, forceRefresh = true }: { contactId: number; connectionId: number; channelType?: string; forceRefresh?: boolean }) => {
      setIsUpdating(true);
      try {
        const isWhatsApp = channelType === 'whatsapp' || channelType === 'whatsapp_unofficial';
        const res = await apiRequest(
          "POST",
          isWhatsApp
            ? `/api/contacts/${contactId}/sync-whatsapp`
            : `/api/contacts/${contactId}/update-profile-picture`,
          { connectionId, forceRefresh }
        );
        return await res.json();
      } finally {
        setIsUpdating(false);
      }
    },
    onSuccess: (data: { noPicture?: boolean; profilePictureUrl?: string | null; status?: 'updated' | 'unchanged' | 'skipped' }, variables) => {

      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${variables.contactId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-conversations"] });


      queryClient.invalidateQueries({ queryKey: ['participant-profile-picture'] });
      queryClient.invalidateQueries({ queryKey: ['participant-profile-pictures'] });

      const isWhatsApp = variables.channelType === 'whatsapp' || variables.channelType === 'whatsapp_unofficial';
      if (isWhatsApp && data.status) {
        toast({
          title: t(data.status === 'skipped'
            ? 'contacts.whatsapp_sync.individual_skipped_title'
            : 'contacts.whatsapp_sync.individual_success_title'),
          description: t(`contacts.whatsapp_sync.individual_${data.status}`),
        });
      } else if (data.noPicture) {
        toast({
          title: t('contacts.avatar.no_picture_title'),
          description: t('contacts.avatar.no_picture_description'),
        });
      } else {
        toast({
          title: t('contacts.avatar.updated_title'),
          description: t('contacts.avatar.updated_description'),
        });
      }
    },
    onError: (error: Error & { errorCode?: string }) => {
      toast({
        title: t('contacts.avatar.update_failed_title'),
        description: error.errorCode === 'NO_ELIGIBLE_CONNECTION'
          ? t('contacts.whatsapp_sync.no_eligible_connection')
          : t('contacts.avatar.update_failed_description'),
        variant: "destructive"
      });
    }
  });

  return {
    updateProfilePicture: updateProfilePictureMutation.mutate,
    isUpdating,
    isError: updateProfilePictureMutation.isError,
    error: updateProfilePictureMutation.error
  };
}
