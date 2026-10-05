import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./use-auth";

export interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  maxUsers: number;
  maxContacts: number;
  maxChannels: number;
  maxFlows: number;
  isActive: boolean;
  features: string[];
  createdAt: string;
  updatedAt: string;

  discountType?: "none" | "percentage" | "fixed_amount";
  discountValue?: number;
  discountDuration?: "permanent" | "first_month" | "first_year" | "limited_time";
  discountStartDate?: string;
  discountEndDate?: string;
  originalPrice?: number;

  storageLimit?: number; // in MB
  bandwidthLimit?: number; // monthly bandwidth in MB
  fileUploadLimit?: number; // max file size per upload in MB
  totalFilesLimit?: number; // max number of files


  billingInterval?: string;
  customDurationDays?: number | null;

  isFree?: boolean;
  hasTrialPeriod?: boolean;
  trialDays?: number;
}

export function useAvailablePlans() {
  const { user } = useAuth();
  
  const { data: plans, isLoading, error } = useQuery<Plan[]>({
    queryKey: ['/api/plans'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
    enabled: !!user, // Only run when user is authenticated
  });

  return {
    plans: plans || [],
    isLoading,
    error
  };
}
