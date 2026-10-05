import { useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Save } from "lucide-react";
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

interface Company {
  id: number;
  name: string;
  active: boolean;
}

export default function NewUserPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();

  const userSchema = useMemo(
    () =>
      z
        .object({
          username: z.string().email(t("admin.users.validation.username_email", "Username must be a valid email address")),
          email: z.string().email(t("admin.users.validation.email", "Email must be a valid email address")),
          fullName: z.string().min(2, t("admin.users.validation.full_name_min", "Full name must be at least 2 characters")),
          password: z.string().min(6, t("admin.users.validation.password_min", "Password must be at least 6 characters")),
          confirmPassword: z.string(),
          role: z.enum(["admin", "agent", "user"]),
          companyId: z.number().optional(),
          isSuperAdmin: z.boolean().default(false),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: t("admin.users.validation.passwords_mismatch", "Passwords don't match"),
          path: ["confirmPassword"],
        }),
    [t]
  );

  type UserFormValues = z.infer<typeof userSchema>;

  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      window.location.href = "/";
    }
  }, [user, isLoading]);

  const { data: companies, isLoading: isLoadingCompanies } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      return res.json();
    },
    enabled: !!user?.isSuperAdmin
  });

  const activeCompanies = companies?.filter(company => company.active) || [];

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: "",
      email: "",
      fullName: "",
      password: "",
      confirmPassword: "",
      role: "agent",
      isSuperAdmin: false,
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: UserFormValues) => {
      const { confirmPassword, ...userData } = data;
      const res = await apiRequest("POST", "/api/admin/users", userData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.users.error_create", "Failed to create user"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: t("admin.users.user_created_title", "User Created"),
        description: t("admin.users.user_created_desc", "The user has been created successfully"),
      });
      setTimeout(() => {
        window.location.href = "/admin/users";
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.users.error_create", "Failed to create user"),
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: UserFormValues) => {
    createUserMutation.mutate(data);
  };

  const handleCompanyChange = (value: string) => {
    form.setValue("companyId", parseInt(value));
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
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/admin/users"}
            className="mr-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("admin.users.back_to_users", "Back to Users")}
          </Button>
          <h1 className="text-2xl">{t("admin.users.create_title", "Create New User")}</h1>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{t("admin.users.user_information", "User Information")}</CardTitle>
            <CardDescription>
              {t("admin.users.create_description", "Create a new user account in the system")}
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.users.username_email", "Username (Email)")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("admin.users.placeholder_email", "user@example.com")} {...field} />
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.users.password", "Password")}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.users.confirm_password", "Confirm Password")}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.users.role", "Role")}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("admin.users.select_role", "Select a role")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">{t("admin.users.role_admin", "Admin")}</SelectItem>
                            <SelectItem value="agent">{t("admin.users.role_agent", "Agent")}</SelectItem>
                            <SelectItem value="user">{t("admin.users.role_user", "User")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormItem>
                    <FormLabel>{t("admin.users.company", "Company")}</FormLabel>
                    <Select
                      onValueChange={handleCompanyChange}
                      disabled={isLoadingCompanies || form.watch("isSuperAdmin")}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("admin.users.select_company", "Select a company")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeCompanies.map(company => (
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
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (checked) {
                              form.setValue("companyId", undefined);
                            }
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createUserMutation.isPending}
                >
                  {createUserMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("admin.users.creating_user", "Creating User...")}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {t("admin.users.create_user", "Create User")}
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
