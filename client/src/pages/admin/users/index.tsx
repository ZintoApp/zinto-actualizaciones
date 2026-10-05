import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Filter } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  isSuperAdmin: boolean;
  companyId: number | null;
  companyName?: string;
  createdAt: string;
  updatedAt: string;
}

interface Company {
  id: number;
  name: string;
}

export default function UsersPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      window.location.href = "/";
    }
  }, [user, isLoading]);

  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!user?.isSuperAdmin
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      return res.json();
    },
    enabled: !!user?.isSuperAdmin
  });

  const getUserCompanyName = (user: User) => {
    if (user.companyName) {
      return user.companyName;
    }

    if (user.companyId) {
      const company = companies?.find((company) => company.id === user.companyId);
      if (company?.name) {
        return company.name;
      }
    }

    return t("admin.users.system", "System");
  };

  const filteredUsers = users?.filter(u => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCompany = companyFilter === null || u.companyId === companyFilter;

    return matchesSearch && matchesCompany;
  });

  const handleResetPassword = async (userId: number) => {
    try {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`, {});
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.users.error_reset_password", "Failed to reset password"));
      }

      const data = await res.json();

      // Try to copy password to clipboard
      try {
        await navigator.clipboard.writeText(data.temporaryPassword);
        toast({
          title: t("admin.users.toast.reset_password_title", "Password Reset"),
          description: t("admin.users.toast.temporary_password_desc", "Temporary password: {{password}}", {
            password: data.temporaryPassword,
          }),
        });
        toast({
          title: t("admin.users.toast.copied_title", "Copied to Clipboard"),
          description: t("admin.users.toast.copied_desc", "The temporary password has been copied to your clipboard."),
        });
      } catch (clipboardError) {
        // Clipboard access failed - show error and keep password visible
        toast({
          title: t("admin.users.toast.reset_password_title", "Password Reset"),
          description: t("admin.users.toast.temporary_password_desc", "Temporary password: {{password}}", {
            password: data.temporaryPassword,
          }),
          duration: 10000, // Keep visible for 10 seconds so admin can copy manually
        });
        toast({
          title: t("admin.users.toast.clipboard_failed_title", "Clipboard Copy Failed"),
          description: t(
            "admin.users.toast.clipboard_failed_desc",
            "Could not copy password to clipboard. Please copy it manually from the password toast above."
          ),
          variant: "destructive",
          duration: 10000,
        });
      }
    } catch (error: any) {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.users.error_reset_password", "Failed to reset password"),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isSuperAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl">{t("admin.users.title", "Users")}</h1>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("admin.users.manage_title", "Manage Users")}</CardTitle>
            <CardDescription>
              {t("admin.users.manage_description", "View and manage all users in the system")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("admin.users.search_placeholder", "Search users...")}
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="h-4 w-4" />
                    {companyFilter !== null
                      ? t("admin.users.filtered", "Filtered")
                      : t("admin.users.filter", "Filter")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{t("admin.users.filter_by_company", "Filter by Company")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCompanyFilter(null)}>
                    {t("admin.users.all_companies", "All Companies")}
                  </DropdownMenuItem>
                  {companies?.map(company => (
                    <DropdownMenuItem
                      key={company.id}
                      onClick={() => setCompanyFilter(company.id)}
                    >
                      {company.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {isLoadingUsers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredUsers?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm || companyFilter !== null
                  ? t("admin.users.no_match_search", "No users match your search")
                  : t("admin.users.no_users", "No users found.")}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.users.table.name", "Name")}</TableHead>
                      <TableHead>{t("admin.users.table.email", "Email")}</TableHead>
                      <TableHead>{t("admin.users.table.role", "Role")}</TableHead>
                      <TableHead>{t("admin.users.table.company", "Company")}</TableHead>
                      <TableHead>{t("admin.users.actions", "Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers?.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.fullName}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          {user.isSuperAdmin ? (
                            <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-300 dark:hover:bg-purple-900">
                              {t("admin.users.super_admin", "Super Admin")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="capitalize">
                              {user.role}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{getUserCompanyName(user)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="btn-brand-primary">
                                {t("admin.users.actions", "Actions")}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => window.location.href = `/admin/users/${user.id}`}
                              >
                                {t("admin.users.edit_user", "Edit User")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleResetPassword(user.id)}
                              >
                                {t("admin.users.reset_password", "Reset Password")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
