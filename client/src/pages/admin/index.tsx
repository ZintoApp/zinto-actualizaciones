import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import AdminLoginPage from "./login";

export default function AdminRedirect() {
  const { user, isLoading } = useAuth();
  const [_, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (user && user.isSuperAdmin) {
        navigate("/admin/dashboard");
      } else if (user) {
        navigate("/");
      }
    }
  }, [user, isLoading, navigate]);

  if (isLoading || !user) {
    return <AdminLoginPage />;
  }

  return null;
}
