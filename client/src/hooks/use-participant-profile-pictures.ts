import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ParticipantProfilePictureCache {
  [participantJid: string]: string | null;
}

interface UseParticipantProfilePicturesOptions {
  connectionId?: number;
  conversationId?: number;
  participantJids?: string[];
  enabled?: boolean;
}

export function useParticipantProfilePictures({
  connectionId,
  conversationId,
  participantJids = [],
  enabled = true
}: UseParticipantProfilePicturesOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cache, setCache] = useState<ParticipantProfilePictureCache>({});


  const {
    data: participantPictures,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['participant-profile-pictures', conversationId, connectionId, participantJids.sort()],
    queryFn: async () => {
      if (!connectionId || !conversationId || participantJids.length === 0) {
        return {};
      }

      try {
        const response = await apiRequest(
          'POST',
          `/api/whatsapp/participants-pictures/${connectionId}`,
          { participantJids, conversationId }
        );
        
        const data = await response.json();
        
        if (data.success) {
          return data.participants;
        } else {
          throw new Error(data.message || 'Failed to fetch participant profile pictures');
        }
      } catch (error: any) {
        console.error('Error fetching participant profile pictures:', error);
        throw error;
      }
    },
    enabled: enabled && !!connectionId && !!conversationId && participantJids.length > 0,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - profile pictures don't change often
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days - keep in memory cache longer
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });


  useEffect(() => {
    if (participantPictures) {
      setCache(prev => ({ ...prev, ...participantPictures }));
    }
  }, [participantPictures]);


  const fetchSingleParticipantPicture = useMutation({
    mutationFn: async ({ connectionId, participantJid }: { connectionId: number; participantJid: string }) => {
      try {
        const response = await apiRequest(
          'GET',
          `/api/whatsapp/participant-picture/${connectionId}/${encodeURIComponent(participantJid)}?conversationId=${conversationId}`
        );
        
        const data = await response.json();
        
        if (data.success) {
          return { participantJid, url: data.url };
        } else {
          return { participantJid, url: null };
        }
      } catch (error: any) {
        console.error(`Error fetching profile picture for ${participantJid}:`, error);
        return { participantJid, url: null };
      }
    },
    onSuccess: (data) => {
      setCache(prev => ({ ...prev, [data.participantJid]: data.url }));
      

      queryClient.setQueryData(
        ['participant-profile-pictures', conversationId, connectionId, participantJids.sort()],
        (oldData: any) => ({
          ...oldData,
          [data.participantJid]: data.url
        })
      );
    },
    onError: (error: Error, variables) => {
      console.error(`Failed to fetch profile picture for ${variables.participantJid}:`, error);
    }
  });


  const getParticipantPicture = (participantJid: string): string | null => {
    return cache[participantJid] || null;
  };


  const fetchParticipantPicture = async (participantJid: string) => {
    if (!connectionId || !conversationId) return null;
    

    if (cache[participantJid] !== undefined) {
      return cache[participantJid];
    }


    const result = await fetchSingleParticipantPicture.mutateAsync({
      connectionId,
      participantJid
    });

    return result.url;
  };


  const refreshParticipantPictures = () => {
    if (connectionId && participantJids.length > 0) {
      refetch();
    }
  };


  const clearParticipantCache = (participantJidsToRemove: string[]) => {
    setCache(prev => {
      const newCache = { ...prev };
      participantJidsToRemove.forEach(jid => {
        delete newCache[jid];
      });
      return newCache;
    });
  };

  return {
    participantPictures: cache,
    isLoading,
    error,
    getParticipantPicture,
    fetchParticipantPicture,
    refreshParticipantPictures,
    clearParticipantCache,
    isFetchingSingle: fetchSingleParticipantPicture.isPending
  };
}


export function useParticipantProfilePicture(connectionId?: number, participantJid?: string, conversationId?: number) {
  const { toast } = useToast();

  const {
    data: profilePictureUrl,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['participant-profile-picture', conversationId, connectionId, participantJid],
    queryFn: async () => {
      if (!connectionId || !participantJid || !conversationId) {
        return null;
      }

      try {
        const response = await apiRequest(
          'GET',
          `/api/whatsapp/participant-picture/${connectionId}/${encodeURIComponent(participantJid)}?conversationId=${conversationId}`
        );
        
        const data = await response.json();
        
        if (data.success) {
          return data.url;
        } else {
          return null;
        }
      } catch (error: any) {
        console.error(`Error fetching profile picture for ${participantJid}:`, error);
        return null;
      }
    },
    enabled: !!connectionId && !!participantJid && !!conversationId,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - profile pictures don't change often
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days - keep in memory cache longer
    retry: 1,
  });

  return {
    profilePictureUrl,
    isLoading,
    error,
    refetch
  };
}
