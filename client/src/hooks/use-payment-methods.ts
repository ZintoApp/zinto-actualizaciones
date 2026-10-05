import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./use-auth";

export interface PaymentMethod {
  id: string;
  name: string;
  description: string;
  testMode?: boolean;
}

export function usePaymentMethods() {
  const { user } = useAuth();
  
  const { data: paymentMethods, isLoading, error } = useQuery<PaymentMethod[]>({
    queryKey: ['/api/payment/methods'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/payment/methods");
      if (!res.ok) throw new Error("Failed to fetch payment methods");
      return res.json();
    },
    enabled: !!user, // Only run when user is authenticated
  });

  return {
    paymentMethods: paymentMethods || [],
    isLoading,
    error
  };
}
