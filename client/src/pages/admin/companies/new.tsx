import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Eye, EyeOff, ImagePlus, Loader2, Save, ShieldCheck, UserRound, X } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAuth } from "@/hooks/use-auth";
import { usePlans } from "@/hooks/use-plans";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useCurrency } from "@/contexts/currency-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LocalizedPhoneInput } from "@/components/ui/localized-phone-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const buildCompanySchema = (t: (key: string, fallback?: string) => string) => z.object({
  name: z.string().trim().min(1, t("admin.companies.registration.validation.name", "Company name is required")),
  slug: z.string().trim().min(2, t("admin.companies.registration.validation.slug_required", "Company slug is required")).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t("admin.companies.registration.validation.slug_format", "Use lowercase letters, numbers, and hyphens")),
  whatsappNumber: z.string().trim().min(1, t("admin.companies.registration.validation.whatsapp", "WhatsApp number is required")),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, t("admin.companies.registration.validation.color", "Enter a valid color")),
  adminFullName: z.string().trim().min(1, t("admin.companies.registration.validation.admin_name", "Administrator name is required")),
  adminEmail: z.string().trim().email(t("admin.companies.registration.validation.email", "Enter a valid email")), adminUsername: z.string().trim().min(3, t("admin.companies.registration.validation.username", "Username must contain at least 3 characters")),
  adminPassword: z.string().min(6, t("admin.companies.registration.validation.password", "Password must contain at least 6 characters")), confirmPassword: z.string().min(1, t("admin.companies.registration.validation.confirm_password", "Confirm the password")),
  planId: z.number().int().positive(), initialStatus: z.enum(["active", "pending", "trial"]),
  useCustomMaxUsers: z.boolean(), customMaxUsers: z.number().int().positive().optional(),
}).superRefine((v, ctx) => {
  if (v.adminPassword !== v.confirmPassword) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: t("admin.companies.registration.validation.password_match", "Passwords do not match") });
  if (v.useCustomMaxUsers && !v.customMaxUsers) ctx.addIssue({ code: "custom", path: ["customMaxUsers"], message: t("admin.companies.registration.validation.user_limit", "Enter a user limit") });
});
type Values = z.infer<ReturnType<typeof buildCompanySchema>>;
const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export default function NewCompanyPage() {
  const { user, isLoading } = useAuth(); const { plans, isLoading: plansLoading } = usePlans();
  const { formatCurrency } = useCurrency(); const { toast } = useToast(); const { t } = useTranslation(); const [, navigate] = useLocation();
  const companySchema = useMemo(() => buildCompanySchema(t), [t]);
  const stepInfo = [[t("admin.companies.registration.steps.company", "Company"), Building2], [t("admin.companies.registration.steps.admin", "Administrator"), UserRound], [t("admin.companies.registration.steps.plan", "Plan & Status"), ShieldCheck], [t("admin.companies.registration.steps.review", "Review"), CheckCircle2]] as const;
  const [step, setStep] = useState(0); const [slugEdited, setSlugEdited] = useState(false);
  const [checkingSlug, setCheckingSlug] = useState(false); const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false); const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null); const logoInput = useRef<HTMLInputElement>(null);
  const activePlans = useMemo(() => plans.filter(p => p.isActive), [plans]);
  const defaultPlan = activePlans.find(p => p.name.toLowerCase() === "free") || activePlans[0];
  const form = useForm<Values>({ resolver: zodResolver(companySchema), defaultValues: { name: "", slug: "", whatsappNumber: "", primaryColor: "#333235", adminFullName: "", adminEmail: "", adminUsername: "", adminPassword: "", confirmPassword: "", planId: 0, initialStatus: "active", useCustomMaxUsers: false } });
  const selectedPlan = plans.find(p => p.id === form.watch("planId"));
  const supportsTrial = Boolean(selectedPlan?.hasTrialPeriod && selectedPlan.trialDays && selectedPlan.trialDays > 0);
  useEffect(() => { if (!isLoading && user && !user.isSuperAdmin) navigate("/"); }, [user, isLoading, navigate]);
  useEffect(() => { if (defaultPlan && !form.getValues("planId")) form.setValue("planId", defaultPlan.id); }, [defaultPlan, form]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const mutation = useMutation({ mutationFn: async (v: Values) => {
    const { confirmPassword, useCustomMaxUsers, ...payload } = v;
    const res = await apiRequest("POST", "/api/admin/companies", { ...payload, customMaxUsers: useCustomMaxUsers ? v.customMaxUsers : undefined });
    if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.message || body.error || t("admin.companies.registration.errors.create", "Failed to create company")); }
    const company = await res.json();
    if (logo) { const fd = new FormData(); fd.append("logo", logo); const logoRes = await fetch(`/api/admin/companies/${company.id}/logo`, { method: "POST", body: fd, credentials: "include" }); if (!logoRes.ok) toast({ title: t("admin.companies.registration.toast.logo_failed_title", "Company created, logo upload failed"), description: t("admin.companies.registration.toast.logo_failed_description", "Upload it later from Company Details."), variant: "destructive" }); }
    return company;
  }, onSuccess: company => { queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] }); toast({ title: t("admin.companies.registration.toast.success_title", "Company registered"), description: t("admin.companies.registration.toast.success_description", "{{name}} and its administrator are ready.", { name: company.name }) }); navigate(`/admin/companies/${company.id}`); }, onError: (e: Error) => toast({ title: t("admin.companies.registration.toast.failed_title", "Registration failed"), description: e.message, variant: "destructive" }) });

  const next = async () => {
    const groups: (keyof Values)[][] = [["name", "slug", "whatsappNumber", "primaryColor"], ["adminFullName", "adminEmail", "adminUsername", "adminPassword", "confirmPassword"], ["planId", "initialStatus", "useCustomMaxUsers", "customMaxUsers"]];
    if (!(await form.trigger(groups[step]))) return;
    if (step === 0) { setCheckingSlug(true); try { const r = await apiRequest("POST", "/api/company/check-slug", { slug: form.getValues("slug") }); const d = await r.json(); setSlugAvailable(d.available); if (!d.available) { form.setError("slug", { message: t("admin.companies.registration.validation.slug_used", "This slug is already in use") }); return; } } finally { setCheckingSlug(false); } }
    if (step === 2 && form.getValues("initialStatus") === "trial" && !supportsTrial) { form.setError("initialStatus", { message: t("admin.companies.registration.validation.trial", "This plan does not support a trial") }); return; }
    setStep(s => Math.min(3, s + 1));
  };
  const pickLogo = (file?: File) => { if (!file) return; if (!['image/jpeg','image/png','image/gif','image/webp'].includes(file.type) || file.size > 5*1024*1024) { toast({ title: t("admin.companies.registration.toast.invalid_logo_title", "Invalid logo"), description: t("admin.companies.registration.toast.invalid_logo_description", "Use JPG, PNG, GIF, or WebP under 5 MB."), variant: "destructive" }); return; } if (preview) URL.revokeObjectURL(preview); setLogo(file); setPreview(URL.createObjectURL(file)); };
  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user?.isSuperAdmin) return null;
  const v = form.getValues(); const summary = [[t("admin.companies.registration.fields.company", "Company"),v.name],[t("admin.companies.registration.fields.slug", "Slug"),v.slug],[t("admin.companies.registration.fields.whatsapp", "WhatsApp"),v.whatsappNumber],[t("admin.companies.registration.fields.administrator", "Administrator"),v.adminFullName],[t("admin.companies.registration.fields.email", "Email"),v.adminEmail],[t("admin.companies.registration.fields.username", "Username"),v.adminUsername],[t("admin.companies.registration.fields.password", "Password"),"••••••••"],[t("admin.companies.registration.fields.plan", "Plan"),selectedPlan?.name],[t("admin.companies.registration.fields.status", "Initial status"),t(`admin.companies.registration.status.${v.initialStatus}`,v.initialStatus)],[t("admin.companies.registration.fields.max_users", "Maximum users"),v.useCustomMaxUsers?v.customMaxUsers:selectedPlan?.maxUsers]];
  return <AdminLayout><div className="mx-auto max-w-6xl p-4 sm:p-6">
    <div className="mb-6 flex items-center gap-3"><Button variant="ghost" size="icon" aria-label={t("admin.companies.registration.actions.back_companies", "Back to companies")} onClick={() => navigate("/admin/companies")}><ArrowLeft /></Button><div><h1 className="text-2xl">{t("admin.companies.registration.title", "Register Company")}</h1><p className="text-sm text-muted-foreground">{t("admin.companies.registration.subtitle", "Create a company and its first administrator.")}</p></div></div>
    <ol className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">{stepInfo.map(([title, Icon], i) => <li key={title} aria-current={i===step?"step":undefined} className={cn("flex items-center gap-3 rounded-lg border p-3",i===step&&"border-primary bg-primary/5")}><span className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-muted",i<=step&&"bg-primary text-primary-foreground")}>{i<step?<Check className="h-4 w-4"/>:<Icon className="h-4 w-4"/>}</span><div><p className="text-xs text-muted-foreground">{t("admin.companies.registration.step_number", "Step {{number}}", { number: i+1 })}</p><p className="text-sm font-medium">{title}</p></div></li>)}</ol>
    <Card><CardHeader><CardTitle>{stepInfo[step][0]}</CardTitle><CardDescription>{[t("admin.companies.registration.descriptions.company", "Enter company identity and optional branding."),t("admin.companies.registration.descriptions.admin", "Create the first company administrator."),t("admin.companies.registration.descriptions.plan", "Choose access and subscription settings."),t("admin.companies.registration.descriptions.review", "Confirm all details before registration.")][step]}</CardDescription></CardHeader><CardContent><Form {...form}><form onSubmit={form.handleSubmit(d=>mutation.mutate(d))} className="space-y-6">
      {step===0&&<div className="grid gap-6 md:grid-cols-2">
        <FormField control={form.control} name="name" render={({field})=><FormItem><FormLabel>{t("admin.companies.registration.fields.company_name", "Company name")}</FormLabel><FormControl><Input {...field} autoFocus onChange={e=>{field.onChange(e);if(!slugEdited){form.setValue("slug",slugify(e.target.value));setSlugAvailable(null)}}}/></FormControl><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="slug" render={({field})=><FormItem><FormLabel>{t("admin.companies.registration.fields.company_slug", "Company slug")}</FormLabel><div className="relative"><FormControl><Input {...field} className="pr-10" onChange={e=>{setSlugEdited(true);setSlugAvailable(null);field.onChange(slugify(e.target.value))}}/></FormControl>{checkingSlug?<Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin"/>:slugAvailable?<CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500"/>:null}</div><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="whatsappNumber" render={({field})=><FormItem><FormLabel>{t("admin.companies.registration.fields.whatsapp_number", "WhatsApp number")}</FormLabel><FormControl><LocalizedPhoneInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} name={field.name} required placeholder="+57 300 123 4567"/></FormControl><p className="text-xs text-muted-foreground">{t("admin.companies.registration.hints.country_code", "Include the country code.")}</p><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="primaryColor" render={({field})=><FormItem><FormLabel>{t("admin.companies.registration.fields.primary_color", "Primary color")}</FormLabel><div className="flex gap-2"><FormControl><Input {...field} type="color" className="h-10 w-14 p-1"/></FormControl><FormControl><Input {...field} className="font-mono"/></FormControl></div><FormMessage/></FormItem>}/>
        <div className="md:col-span-2"><Label>{t("admin.companies.registration.fields.logo_optional", "Company logo (optional)")}</Label><input ref={logoInput} className="hidden" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e=>pickLogo(e.target.files?.[0])}/><div className="mt-2 flex items-center gap-4 rounded-lg border border-dashed p-4">{preview?<img src={preview} alt={t("admin.companies.registration.logo_preview", "Logo preview")} className="h-16 w-16 rounded object-contain"/>:<ImagePlus className="h-10 w-10 text-muted-foreground"/>}<div className="flex-1 text-sm text-muted-foreground">{t("admin.companies.registration.hints.logo", "JPG, PNG, GIF, or WebP · 5 MB maximum")}</div><Button type="button" variant="outline" onClick={()=>logoInput.current?.click()}>{t("admin.companies.registration.actions.choose_logo", "Choose logo")}</Button>{logo&&<Button type="button" variant="ghost" size="icon" aria-label={t("admin.companies.registration.actions.remove_logo", "Remove logo")} onClick={()=>{setLogo(null);setPreview(null)}}><X/></Button>}</div></div>
      </div>}
      {step===1&&<div className="grid gap-6 md:grid-cols-2">
        {([['adminFullName',t("admin.companies.registration.fields.full_name","Full name"),'text'],['adminEmail',t("admin.companies.registration.fields.email","Email"),'email'],['adminUsername',t("admin.companies.registration.fields.username","Username"),'text']] as const).map(([name,label,type])=><FormField key={name} control={form.control} name={name} render={({field})=><FormItem><FormLabel>{label}</FormLabel><FormControl><Input {...field} type={type}/></FormControl><FormMessage/></FormItem>}/>) }
        <div/>{(['adminPassword','confirmPassword'] as const).map(name=><FormField key={name} control={form.control} name={name} render={({field})=><FormItem><FormLabel>{name==='adminPassword'?t("admin.companies.registration.fields.password","Password"):t("admin.companies.registration.fields.confirm_password","Confirm password")}</FormLabel><div className="relative"><FormControl><Input {...field} type={showPassword?'text':'password'} className="pr-10" autoComplete="new-password"/></FormControl><Button type="button" variant="ghost" size="icon" aria-label={showPassword?t("admin.companies.registration.actions.hide_password","Hide password"):t("admin.companies.registration.actions.show_password","Show password")} className="absolute right-0 top-0" onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff/>:<Eye/>}</Button></div><FormMessage/></FormItem>}/>) }
      </div>}
      {step===2&&<div className="space-y-6">
        <FormField control={form.control} name="planId" render={({field})=><FormItem><FormLabel>{t("admin.companies.registration.fields.subscription_plan","Subscription plan")}</FormLabel><Select disabled={plansLoading} value={field.value?String(field.value):""} onValueChange={x=>{field.onChange(Number(x));form.setValue("initialStatus","active")}}><FormControl><SelectTrigger><SelectValue placeholder={t("admin.companies.registration.actions.select_plan","Select a plan")}/></SelectTrigger></FormControl><SelectContent>{activePlans.map(p=><SelectItem key={p.id} value={String(p.id)}>{t("admin.companies.registration.plan_option","{{name}} ({{price}}/month) · {{users}} users",{name:p.name,price:formatCurrency(p.price),users:p.maxUsers})}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="initialStatus" render={({field})=><FormItem><FormLabel>{t("admin.companies.registration.fields.status","Initial status")}</FormLabel><div className="grid gap-3 sm:grid-cols-3">{([['active',t("admin.companies.registration.status.active","Active"),t("admin.companies.registration.status.active_desc","Immediate access")],['pending',t("admin.companies.registration.status.pending","Pending"),t("admin.companies.registration.status.pending_desc","Access disabled")],['trial',t("admin.companies.registration.status.trial","Trial"),supportsTrial?t("admin.companies.registration.status.trial_days","{{days}} days",{days:selectedPlan?.trialDays}):t("admin.companies.registration.status.unavailable","Not available")]] as const).map(([value,label,desc])=><button key={value} type="button" disabled={value==='trial'&&!supportsTrial} onClick={()=>field.onChange(value)} className={cn("rounded-lg border p-4 text-left disabled:opacity-50",field.value===value&&"border-primary bg-primary/5")}><b>{label}</b><span className="block text-xs text-muted-foreground">{desc}</span></button>)}</div><FormMessage/></FormItem>}/>
        <div className="rounded-lg border p-4"><div className="flex justify-between"><div><Label>{t("admin.companies.registration.fields.custom_limit","Custom user limit")}</Label><p className="text-xs text-muted-foreground">{t("admin.companies.registration.hints.plan_default","Plan default: {{count}}",{count:selectedPlan?.maxUsers??'—'})}</p></div><FormField control={form.control} name="useCustomMaxUsers" render={({field})=><Switch checked={field.value} onCheckedChange={field.onChange}/>}/></div>{form.watch('useCustomMaxUsers')&&<FormField control={form.control} name="customMaxUsers" render={({field})=><FormItem className="mt-4 max-w-xs"><FormLabel>{t("admin.companies.registration.fields.max_users","Maximum users")}</FormLabel><FormControl><Input type="number" min={1} value={field.value??''} onChange={e=>field.onChange(e.target.value?Number(e.target.value):undefined)}/></FormControl><FormMessage/></FormItem>}/>}</div>
      </div>}
      {step===3&&<div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">{summary.map(([label,value])=><div key={String(label)} className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-medium capitalize">{String(value??'—')}</p></div>)}</div><div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"><ShieldCheck className="mr-2 inline h-4 w-4"/>{t("admin.companies.registration.review.password_notice","The password is encrypted and will not be emailed.")}</div></div>}
      <div className="flex flex-col-reverse justify-between gap-3 border-t pt-5 sm:flex-row"><Button type="button" variant="outline" onClick={()=>step===0?navigate('/admin/companies'):setStep(step-1)}><ArrowLeft className="mr-2 h-4 w-4"/>{step===0?t("common.cancel","Cancel"):t("common.back","Back")}</Button>{step<3?<Button type="button" onClick={next} disabled={checkingSlug}>{t("admin.companies.registration.actions.continue","Continue")}<ArrowRight className="ml-2 h-4 w-4"/></Button>:<Button type="submit" disabled={mutation.isPending}>{mutation.isPending?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Save className="mr-2 h-4 w-4"/>}{t("admin.companies.registration.actions.register","Register company")}</Button>}</div>
    </form></Form></CardContent></Card>
  </div></AdminLayout>;
}
