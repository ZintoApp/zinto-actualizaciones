import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ArrowLeft,
  Save,
  Trash2,
  ShieldCheck as TabIconShieldCheck,
  UserRound as TabIconUserRound,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Company {
  id: number;
  name: string;
  slug: string;
  active: boolean;
}

interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  companyId: number | null;
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function UserDetailPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [userId, setUserId] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const userUpdateSchema = useMemo(
    () =>
      z.object({
        fullName: z.string().min(2, t("admin.users.validation.full_name_min", "Full name must be at least 2 characters")),
        email: z.string().email(t("admin.users.validation.email", "Email must be a valid email address")),
        role: z.enum(["admin", "agent", "user", "super_admin"]),
        companyId: z.number().optional(),
        isSuperAdmin: z.boolean().default(false),
      }),
    [t]
  );

  const passwordChangeSchema = useMemo(
    () =>
      z
        .object({
          newPassword: z.string().min(6, t("admin.users.validation.password_min", "Password must be at least 6 characters")),
          confirmPassword: z.string(),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: t("admin.users.validation.passwords_mismatch", "Passwords don't match"),
          path: ["confirmPassword"],
        }),
    [t]
  );

  type UserUpdateFormValues = z.infer<typeof userUpdateSchema>;
  type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

  useEffect(() => {
    const path = window.location.pathname;
    const id = parseInt(path.split('/').pop() || '');
    if (!isNaN(id)) {
      setUserId(id);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      window.location.href = "/";
    }
  }, [user, isLoading]);

  const { data: userData, isLoading: isLoadingUser } = useQuery<User>({
    queryKey: ['/api/admin/users', userId],
    queryFn: async () => {
      if (!userId) throw new Error("User ID is required");
      const res = await apiRequest("GET", `/api/admin/users/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    enabled: !!userId && !!user?.isSuperAdmin
  });

  const { data: companies, isLoading: isLoadingCompanies } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      return res.json();
    },
    enabled: !!user?.isSuperAdmin
  });

  const form = useForm<UserUpdateFormValues>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      fullName: "",
      email: "",
      role: "agent",
      isSuperAdmin: false,
    },
  });

  const activeCompanies = companies?.filter(company => company.active) || [];
  const isSuperAdminSelected = form.watch("isSuperAdmin");
  const availableCompanies = useMemo(
    () => activeCompanies.filter((company) => isSuperAdminSelected || company.slug !== "system"),
    [activeCompanies, isSuperAdminSelected]
  );

  const passwordForm = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (userData) {
      form.reset({
        fullName: userData.fullName,
        email: userData.email,
        role: (userData.isSuperAdmin ? "admin" : userData.role === "user" ? "agent" : userData.role) as any,
        companyId: userData.companyId || undefined,
        isSuperAdmin: userData.isSuperAdmin,
      });
    }
  }, [userData, form]);

  useEffect(() => {
    const selectedCompanyId = form.getValues("companyId");
    if (!isSuperAdminSelected && selectedCompanyId) {
      const selectedCompany = activeCompanies.find((company) => company.id === selectedCompanyId);
      if (selectedCompany?.slug === "system") {
        form.setValue("companyId", undefined);
      }
    }
  }, [activeCompanies, form, isSuperAdminSelected]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: UserUpdateFormValues) => {
      if (!userId) throw new Error("User ID is required");
      const res = await apiRequest("PUT", `/api/admin/users/${userId}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.users.error_update", "Failed to update user"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users', userId] });
      toast({
        title: t("admin.users.user_updated_title", "User Updated"),
        description: t("admin.users.user_updated_desc", "The user has been updated successfully"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.users.error_update", "Failed to update user"),
        variant: "destructive",
      });
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { newPassword: string }) => {
      if (!userId) throw new Error("User ID is required");
      const res = await apiRequest("POST", `/api/admin/users/${userId}/change-password`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.users.error_change_password", "Failed to change password"));
      }
      return res.json();
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({
        title: t("admin.users.password_changed_title", "Password Changed"),
        description: t("admin.users.password_changed_desc", "The user's password has been changed successfully"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.users.error_change_password", "Failed to change password"),
        variant: "destructive",
      });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("User ID is required");
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.users.error_delete", "Failed to delete user"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: t("admin.users.user_deleted_title", "User Deleted"),
        description: t("admin.users.user_deleted_desc", "The user has been deleted successfully"),
      });
      setTimeout(() => {
        window.location.href = "/admin/users";
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.users.error_delete", "Failed to delete user"),
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: UserUpdateFormValues) => {
    updateUserMutation.mutate(data);
  };

  const onChangePassword = (data: PasswordChangeFormValues) => {
    changePasswordMutation.mutate({ newPassword: data.newPassword });
  };

  const handleDeleteUser = () => {
    deleteUserMutation.mutate();
    setIsDeleteDialogOpen(false);
  };

  const handleCompanyChange = (value: string) => {
    form.setValue("companyId", parseInt(value));
  };

  if (isLoading || isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isSuperAdmin || !userData) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = "/admin/users"}
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("admin.users.back_to_users", "Back to Users")}
            </Button>
            <h1 className="text-2xl">
              {t("admin.users.edit_title", "Edit User: {{name}}", { name: userData.fullName })}
            </h1>
          </div>

          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("admin.users.delete_user", "Delete User")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("admin.users.delete_confirm_title", "Are you sure?")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    "admin.users.delete_confirm_desc",
                    "This action cannot be undone. This will permanently delete the user account and remove their data from our servers."
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("admin.users.cancel", "Cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteUser}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("admin.users.delete", "Delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Tabs defaultValue="profile" className="max-w-2xl mx-auto">
          <TabsList>
            <TabsTrigger icon={TabIconUserRound} value="profile">{t("admin.users.tab_profile", "Profile Information")}</TabsTrigger>
            <TabsTrigger icon={TabIconShieldCheck} value="security">{t("admin.users.tab_security", "Security")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.users.user_profile", "User Profile")}</CardTitle>
                <CardDescription>
                  {t("admin.users.update_profile_desc", "Update the user's profile information")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.full_name", "Full Name")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("admin.users.placeholder_full_name", "John Doe")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.email", "Email")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("admin.users.placeholder_email", "user@example.com")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("admin.users.role", "Role")}</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={userData.isSuperAdmin ? "admin" : field.value}
                              value={userData.isSuperAdmin ? "admin" : field.value}
                              disabled={userData.isSuperAdmin}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t("admin.users.select_role", "Select a role")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="admin">{t("admin.users.role_admin", "Admin")}</SelectItem>
                                <SelectItem value="agent">{t("admin.users.role_agent", "Agent")}</SelectItem>
                              </SelectContent>
                            </Select>
                            {userData.isSuperAdmin && (
                              <FormDescription className="text-xs">
                                {t("admin.users.super_admin_role_locked", "Role is locked for Super Admin users")}
                              </FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormItem>
                        <FormLabel>{t("admin.users.company", "Company")}</FormLabel>
                        <Select
                          onValueChange={handleCompanyChange}
                          disabled={isLoadingCompanies || form.watch("isSuperAdmin")}
                          value={form.watch("companyId")?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("admin.users.select_company", "Select a company")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableCompanies.map(company => (
                              <SelectItem key={company.id} value={company.id.toString()}>
                                {company.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    </div>

                    <FormField
                      control={form.control}
                      name="isSuperAdmin"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">{t("admin.users.super_admin", "Super Admin")}</FormLabel>
                            <FormDescription>
                              {t("admin.users.super_admin_desc", "Super admins have access to all system features and settings")}
                              <span className="block text-xs mt-1">{t("admin.users.super_admin_readonly", "This setting is read-only.")}</span>
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              disabled
                              aria-readonly="true"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="btn-brand-primary"
                      disabled={updateUserMutation.isPending}
                    >
                      {updateUserMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("admin.users.updating_user", "Updating User...")}
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          {t("admin.users.save_changes", "Save Changes")}
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.users.change_password_card_title", "Change Password")}</CardTitle>
                <CardDescription>
                  {t("admin.users.change_password_card_desc", "Update the user's password")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-6">
                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.new_password", "New Password")}</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.users.confirm_new_password", "Confirm New Password")}</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="btn-brand-primary"
                      disabled={changePasswordMutation.isPending}
                    >
                      {changePasswordMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("admin.users.changing_password", "Changing Password...")}
                        </>
                      ) : (
                        t("admin.users.change_password_submit", "Change Password")
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
