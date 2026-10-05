import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Edit, Trash2, Copy, Tag, Search } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CouponCode {
  id: number;
  code: string;
  name: string;
  description?: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  usageLimit?: number;
  usageLimitPerUser: number;
  currentUsageCount: number;
  startDate: string;
  endDate?: string;
  applicablePlanIds?: number[];
  minimumPlanValue?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const nativeSelectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function CouponsPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponCode | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    discountType: "percentage" as "percentage" | "fixed_amount",
    discountValue: 0,
    usageLimit: null as number | null,
    usageLimitPerUser: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: "",
    applicablePlanIds: [] as number[],
    minimumPlanValue: null as number | null,
    isActive: true
  });

  useEffect(() => {
    if (!isLoadingAuth && user && !user.isSuperAdmin) {
      window.location.href = "/";
    }
  }, [user, isLoadingAuth]);


  const { data: coupons, isLoading: isLoadingCoupons } = useQuery<CouponCode[]>({
    queryKey: ['/api/admin/coupons'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/coupons");
      if (!res.ok) {
        throw new Error("Failed to fetch coupons");
      }
      return res.json();
    },
    enabled: !!user?.isSuperAdmin
  });

  const filteredCoupons = coupons?.filter((coupon) =>
    coupon.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    coupon.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    coupon.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );


  const createCouponMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/admin/coupons", {
        ...data,
        discountValue: Number(data.discountValue),
        usageLimit: data.usageLimit ? Number(data.usageLimit) : null,
        usageLimitPerUser: Number(data.usageLimitPerUser),
        startDate: data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString(),
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
        applicablePlanIds: data.applicablePlanIds.length > 0 ? data.applicablePlanIds : null,
        minimumPlanValue: data.minimumPlanValue ? Number(data.minimumPlanValue) : null
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create coupon");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/coupons'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: t('admin.coupons.created', 'Coupon Created'),
        description: t('admin.coupons.created_desc', 'The coupon has been created successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('admin.coupons.create_error', 'Failed to create coupon'),
        variant: "destructive",
      });
    }
  });


  const updateCouponMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: number }) => {
      const res = await apiRequest("PUT", `/api/admin/coupons/${data.id}`, {
        ...data,
        discountValue: Number(data.discountValue),
        usageLimit: data.usageLimit ? Number(data.usageLimit) : null,
        usageLimitPerUser: Number(data.usageLimitPerUser),
        startDate: data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString(),
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
        applicablePlanIds: data.applicablePlanIds.length > 0 ? data.applicablePlanIds : null,
        minimumPlanValue: data.minimumPlanValue ? Number(data.minimumPlanValue) : null
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update coupon");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/coupons'] });
      setIsEditDialogOpen(false);
      resetForm();
      toast({
        title: t('admin.coupons.updated', 'Coupon Updated'),
        description: t('admin.coupons.updated_desc', 'The coupon has been updated successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('admin.coupons.update_error', 'Failed to update coupon'),
        variant: "destructive",
      });
    }
  });


  const deleteCouponMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/coupons/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete coupon");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/coupons'] });
      toast({
        title: t('admin.coupons.deleted', 'Coupon Deleted'),
        description: t('admin.coupons.deleted_desc', 'The coupon has been deleted successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('admin.coupons.delete_error', 'Failed to delete coupon'),
        variant: "destructive",
      });
    }
  });

  const handleCreateCoupon = () => {
    createCouponMutation.mutate(formData);
  };

  const handleUpdateCoupon = () => {
    if (selectedCoupon) {
      updateCouponMutation.mutate({ ...formData, id: selectedCoupon.id });
    }
  };

  const handleEditCoupon = (coupon: CouponCode) => {
    setSelectedCoupon(coupon);
    setFormData({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description || "",
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      usageLimit: coupon.usageLimit || null,
      usageLimitPerUser: coupon.usageLimitPerUser,
      startDate: new Date(coupon.startDate).toISOString().split('T')[0],
      endDate: coupon.endDate ? new Date(coupon.endDate).toISOString().split('T')[0] : "",
      applicablePlanIds: coupon.applicablePlanIds || [],
      minimumPlanValue: coupon.minimumPlanValue || null,
      isActive: coupon.isActive
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteCoupon = (id: number) => {
    deleteCouponMutation.mutate(id);
  };

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      description: "",
      discountType: "percentage",
      discountValue: 0,
      usageLimit: null,
      usageLimitPerUser: 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: "",
      applicablePlanIds: [],
      minimumPlanValue: null,
      isActive: true
    });
    setSelectedCoupon(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatDiscount = (type: string, value: number) => {
    return type === 'percentage' ? `${value}%` : `$${value}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('common.copied', 'Copied'),
      description: t('admin.coupons.code_copied', 'Coupon code copied to clipboard'),
    });
  };

  if (isLoadingAuth || !user?.isSuperAdmin) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('admin.coupons.title', 'Coupon Codes')}</h1>
            <p className="text-muted-foreground">
              {t('admin.coupons.description', 'Manage discount coupons for your plans')}
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="brand" className="btn-brand-primary">
                <Plus className="mr-2 h-4 w-4" />
                {t('admin.coupons.create', 'Create Coupon')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('admin.coupons.create_title', 'Create New Coupon')}</DialogTitle>
                <DialogDescription>
                  {t('admin.coupons.create_desc', 'Create a new discount coupon for your plans')}
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                {/* Basic Information */}
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="code" className="sm:text-right">
                    {t('admin.coupons.form.code', 'Coupon Code')} *
                  </Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder={t("admin.coupons.placeholder.code", "SAVE20")}
                    className="sm:col-span-3"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="sm:text-right">
                    {t('admin.coupons.form.name', 'Display Name')} *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t("admin.coupons.placeholder.name", "20% Off Discount")}
                    className="sm:col-span-3"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="sm:text-right">
                    {t('admin.coupons.form.description', 'Description')}
                  </Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t("admin.coupons.placeholder.description", "Optional description")}
                    className="sm:col-span-3"
                  />
                </div>

                <Separator />

                {/* Discount Configuration */}
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="discountType" className="sm:text-right">
                    {t('admin.coupons.form.discount_type', 'Discount Type')} *
                  </Label>
                  <div className="sm:col-span-3">
                    <select
                      id="discountType"
                      value={formData.discountType}
                      onChange={(e) => setFormData({ ...formData, discountType: e.target.value as any })}
                      className={nativeSelectClass}
                    >
                      <option value="percentage">
                        {t("admin.coupons.discount_option.percentage", "Percentage Discount")}
                      </option>
                      <option value="fixed_amount">
                        {t("admin.coupons.discount_option.fixed_amount", "Fixed Amount Discount")}
                      </option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="discountValue" className="sm:text-right">
                    {t('admin.coupons.form.discount_value', 'Discount Value')} *
                  </Label>
                  <div className="sm:col-span-3">
                    <div className="relative">
                      {formData.discountType === "percentage" && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      )}
                      {formData.discountType === "fixed_amount" && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      )}
                      <Input
                        id="discountValue"
                        type="number"
                        min="0"
                        max={formData.discountType === "percentage" ? "100" : undefined}
                        step={formData.discountType === "percentage" ? "1" : "0.01"}
                        value={formData.discountValue}
                        onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                        className={formData.discountType === "fixed_amount" ? "pl-8" : "pr-8"}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Usage Limits */}
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="usageLimit" className="sm:text-right">
                    {t('admin.coupons.form.usage_limit', 'Total Usage Limit')}
                  </Label>
                  <Input
                    id="usageLimit"
                    type="number"
                    min="1"
                    value={formData.usageLimit || ""}
                    onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder={t("admin.coupons.placeholder.unlimited", "Unlimited")}
                    className="sm:col-span-3"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="usageLimitPerUser" className="sm:text-right">
                    {t('admin.coupons.form.usage_limit_per_user', 'Per User Limit')} *
                  </Label>
                  <Input
                    id="usageLimitPerUser"
                    type="number"
                    min="1"
                    value={formData.usageLimitPerUser}
                    onChange={(e) => setFormData({ ...formData, usageLimitPerUser: parseInt(e.target.value) || 1 })}
                    className="sm:col-span-3"
                  />
                </div>

                <Separator />

                {/* Date Restrictions */}
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="startDate" className="sm:text-right">
                    {t('admin.coupons.form.start_date', 'Start Date')} *
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="sm:col-span-3"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="endDate" className="sm:text-right">
                    {t('admin.coupons.form.end_date', 'End Date')}
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    placeholder={t("admin.coupons.placeholder.no_expiry", "No expiry")}
                    className="sm:col-span-3"
                  />
                </div>

                <Separator />

                {/* Status */}
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="isActive" className="sm:text-right">
                    {t('admin.coupons.form.status', 'Status')}
                  </Label>
                  <div className="sm:col-span-3 flex items-center space-x-2">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                    <Label htmlFor="isActive">
                      {formData.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                    </Label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  onClick={handleCreateCoupon}
                  disabled={createCouponMutation.isPending || !formData.code || !formData.name}
                  variant="brand"
                  className="btn-brand-primary"
                >
                  {createCouponMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('common.creating', 'Creating...')}
                    </>
                  ) : (
                    t('admin.coupons.create', 'Create Coupon')
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Coupon Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('admin.coupons.edit_title', 'Edit Coupon')}</DialogTitle>
              <DialogDescription>
                {t('admin.coupons.edit_desc', 'Update the coupon settings')}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Same form fields as create, but with edit- prefixes for IDs */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-code" className="sm:text-right">
                  {t('admin.coupons.form.code', 'Coupon Code')} *
                </Label>
                <Input
                  id="edit-code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder={t("admin.coupons.placeholder.code", "SAVE20")}
                  className="sm:col-span-3"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="sm:text-right">
                  {t('admin.coupons.form.name', 'Display Name')} *
                </Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("admin.coupons.placeholder.name", "20% Off Discount")}
                  className="sm:col-span-3"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-description" className="sm:text-right">
                  {t('admin.coupons.form.description', 'Description')}
                </Label>
                <Input
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("admin.coupons.placeholder.description", "Optional description")}
                  className="sm:col-span-3"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-discountType" className="sm:text-right">
                  {t('admin.coupons.form.discount_type', 'Discount Type')} *
                </Label>
                <div className="sm:col-span-3">
                  <select
                    id="edit-discountType"
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value as any })}
                    className={nativeSelectClass}
                  >
                    <option value="percentage">
                      {t("admin.coupons.discount_option.percentage", "Percentage Discount")}
                    </option>
                    <option value="fixed_amount">
                      {t("admin.coupons.discount_option.fixed_amount", "Fixed Amount Discount")}
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-discountValue" className="sm:text-right">
                  {t('admin.coupons.form.discount_value', 'Discount Value')} *
                </Label>
                <div className="sm:col-span-3">
                  <div className="relative">
                    {formData.discountType === "percentage" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                    )}
                    {formData.discountType === "fixed_amount" && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    )}
                    <Input
                      id="edit-discountValue"
                      type="number"
                      min="0"
                      max={formData.discountType === "percentage" ? "100" : undefined}
                      step={formData.discountType === "percentage" ? "1" : "0.01"}
                      value={formData.discountValue}
                      onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                      className={formData.discountType === "fixed_amount" ? "pl-8" : "pr-8"}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Usage Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-usageLimit" className="sm:text-right">
                  {t('admin.coupons.form.usage_limit', 'Total Usage Limit')}
                </Label>
                <Input
                  id="edit-usageLimit"
                  type="number"
                  min="1"
                  value={formData.usageLimit || ""}
                  onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder={t("admin.coupons.placeholder.unlimited", "Unlimited")}
                  className="sm:col-span-3"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-usageLimitPerUser" className="sm:text-right">
                  {t('admin.coupons.form.usage_limit_per_user', 'Per User Limit')} *
                </Label>
                <Input
                  id="edit-usageLimitPerUser"
                  type="number"
                  min="1"
                  value={formData.usageLimitPerUser}
                  onChange={(e) => setFormData({ ...formData, usageLimitPerUser: parseInt(e.target.value) || 1 })}
                  className="sm:col-span-3"
                />
              </div>

              <Separator />

              {/* Date Restrictions */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-startDate" className="sm:text-right">
                  {t('admin.coupons.form.start_date', 'Start Date')} *
                </Label>
                <Input
                  id="edit-startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="sm:col-span-3"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-endDate" className="sm:text-right">
                  {t('admin.coupons.form.end_date', 'End Date')}
                </Label>
                <Input
                  id="edit-endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  placeholder={t("admin.coupons.placeholder.no_expiry", "No expiry")}
                  className="sm:col-span-3"
                />
              </div>

              <Separator />

              {/* Status */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-isActive" className="sm:text-right">
                  {t('admin.coupons.form.status', 'Status')}
                </Label>
                <div className="sm:col-span-3 flex items-center space-x-2">
                  <Switch
                    id="edit-isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                  <Label htmlFor="edit-isActive">
                    {formData.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                  </Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleUpdateCoupon}
                disabled={updateCouponMutation.isPending || !formData.code || !formData.name}
                variant="brand"
                className="btn-brand-primary"
              >
                {updateCouponMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.updating', 'Updating...')}
                  </>
                ) : (
                  t('admin.coupons.update', 'Update Coupon')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Coupons Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.coupons.list_title', 'Manage Coupons')}</CardTitle>
            <CardDescription>
              {t('admin.coupons.list_desc', 'Manage your discount coupons and track their usage')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('admin.coupons.search_placeholder', 'Search coupons...')}
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {isLoadingCoupons ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredCoupons?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p>
                  {searchTerm
                    ? t('admin.coupons.no_search_results', 'No coupons match your search.')
                    : t('admin.coupons.no_coupons', 'No coupons found. Create your first coupon to get started.')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.coupons.table.code', 'Code')}</TableHead>
                      <TableHead>{t('admin.coupons.table.name', 'Name')}</TableHead>
                      <TableHead>{t('admin.coupons.table.discount', 'Discount')}</TableHead>
                      <TableHead>{t('admin.coupons.table.usage', 'Usage')}</TableHead>
                      <TableHead>{t('admin.coupons.table.status', 'Status')}</TableHead>
                      <TableHead>{t('admin.coupons.table.expires', 'Expires')}</TableHead>
                      <TableHead className="text-right">{t('common.actions', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCoupons?.map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                              {coupon.code}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(coupon.code)}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{coupon.name}</div>
                            {coupon.description && (
                              <div className="text-sm text-muted-foreground">{coupon.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {formatDiscount(coupon.discountType, coupon.discountValue)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {coupon.currentUsageCount}
                            {coupon.usageLimit && ` / ${coupon.usageLimit}`}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={coupon.isActive ? "default" : "secondary"}>
                            {coupon.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {coupon.endDate ? formatDate(coupon.endDate) : t('admin.coupons.no_expiry', 'No expiry')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditCoupon(coupon)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t('admin.coupons.delete_title', 'Delete Coupon')}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('admin.coupons.delete_desc', 'Are you sure you want to delete this coupon? This action cannot be undone.')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    {t('common.cancel', 'Cancel')}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteCoupon(coupon.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {t('common.delete', 'Delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
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
