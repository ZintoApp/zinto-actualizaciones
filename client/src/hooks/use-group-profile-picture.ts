import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export function useGroupProfilePicture() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateGroupProfilePictureMutation = useMutation({
    mutationFn: async ({ conversationId, connectionId }: { conversationId: number; connectionId: number }) => {
      setIsUpdating(true);
      try {
        const res = await apiRequest(
          "POST",
          `/api/conversations/${conversationId}/update-group-picture`,
          { connectionId }
        );
        return await res.json();
      } finally {
        setIsUpdating(false);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${variables.conversationId}`] });
      
      toast({
        title: "Group picture updated",
        description: "Successfully fetched the group's WhatsApp profile picture."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update group picture",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  return {
    updateGroupProfilePicture: updateGroupProfilePictureMutation.mutate,
    isUpdating,
    isError: updateGroupProfilePictureMutation.isError,
    error: updateGroupProfilePictureMutation.error
  };
}
