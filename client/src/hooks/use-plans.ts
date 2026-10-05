import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  maxUsers: number;
  maxContacts: number;
  maxChannels: number;
  isActive: boolean;
  features: string[];


  billingInterval?: string;
  customDurationDays?: number | null;
  hasTrialPeriod?: boolean;
  trialDays?: number | null;

  storageLimit?: number; // in MB
  bandwidthLimit?: number; // monthly bandwidth in MB
  fileUploadLimit?: number; // max file size per upload in MB
  totalFilesLimit?: number; // max number of files

  createdAt: string;
  updatedAt: string;
}

export function usePlans() {
  const { data: plans, isLoading, error } = useQuery<Plan[]>({
    queryKey: ['/api/admin/plans'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    }
  });

  return {
    plans: plans || [],
    isLoading,
    error
  };
}
