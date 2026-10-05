import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import React, { useState, useEffect, useMemo } from 'react';
import { ListTodo, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable, type DraggableProvidedDragHandleProps, type DropResult } from '@hello-pangea/dnd';
import { useActiveChannel } from '@/contexts/ActiveChannelContext';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions, PermissionGate, ERP_ACCESS_PERMISSIONS, ERP_DASHBOARD_ROUTE_PERMISSIONS, ERP_REPORTS_ROUTE_PERMISSIONS, type Permission } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useManualRenewal } from '@/contexts/manual-renewal-context';
import useSocket from '@/hooks/useSocket';
import TrialStatus from '@/components/TrialStatus';
import { isLifetimePlan } from '@/utils/plan-duration';
import { apiRequest } from '@/lib/queryClient';
import { useTheme } from 'next-themes';
import { TwilioIcon } from '@/components/icons/TwilioIcon';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useBranding } from '@/contexts/branding-context';
import { useConversations } from '@/context/ConversationContext';
import { useAppSidebarChrome } from '@/contexts/AppSidebarChromeContext';
import { useToast } from '@/hooks/use-toast';
import {
  SIDEBAR_MENU_ITEM_IDS,
  normalizeSidebarMenuOrder,
  reorderVisibleSidebarItems,
  type SidebarMenuItemId,
} from '@shared/sidebar-menu';

const getContrastingTextColor = (background?: string): string => {
  const hex = (background || '#333235').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.56 ? '#111827' : '#ffffff';
};

type TopLevelSidebarItem = {
  id: SidebarMenuItemId;
  href: string;
  icon: string | LucideIcon;
  label: string;
  permissions?: Permission[];
  active: (location: string) => boolean;
  kind?: 'erp';
};

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { setActiveChannelId, activeChannelId } = useActiveChannel();
  const { sidebarCollapsed: isCollapsed, setSidebarCollapsed: setIsCollapsed } = useAppSidebarChrome();
  const [erpExpanded, setErpExpanded] = useState(false);
  const [utilityExpanded, setUtilityExpanded] = useState(false);
  const [, setIsMobile] = useState(false);
  const { company, user } = useAuth();
  const { branding } = useBranding();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { totalUnreadCount } = useConversations();
  const { data: subscriptionStatus } = useSubscriptionStatus();
  const { requestManualRenewal } = useManualRenewal();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditingMenu, setIsEditingMenu] = useState(false);
  const [draftMenuOrder, setDraftMenuOrder] = useState<SidebarMenuItemId[]>([...SIDEBAR_MENU_ITEM_IDS]);
  

  const { data: renewalStatus } = useQuery({
    queryKey: ['/api/plan-renewal/status'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/plan-renewal/status");
      if (!res.ok) throw new Error("Failed to fetch renewal status");
      return res.json();
    },
    enabled: !!company, // Only run when company is available
  });


  const { data: helpSupportData } = useQuery({
    queryKey: ['/api/help-support-url'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/help-support-url");
      if (!res.ok) throw new Error("Failed to fetch help support URL");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  const {
    data: sidebarMenuPreference,
    isPending: isSidebarMenuPreferencePending,
    isError: isSidebarMenuPreferenceError,
  } = useQuery<{ itemOrder: SidebarMenuItemId[] }>({
    queryKey: ['/api/user/sidebar-menu-order', user?.id],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/user/sidebar-menu-order');
      return response.json();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const savedMenuOrder = useMemo(
    () => normalizeSidebarMenuOrder(sidebarMenuPreference?.itemOrder),
    [sidebarMenuPreference?.itemOrder],
  );

  const saveSidebarMenuMutation = useMutation({
    mutationFn: async (itemOrder: SidebarMenuItemId[]) => {
      const response = await apiRequest('PUT', '/api/user/sidebar-menu-order', { itemOrder });
      return response.json() as Promise<{ itemOrder: SidebarMenuItemId[] }>;
    },
    onSuccess: (data) => {
      const normalizedOrder = normalizeSidebarMenuOrder(data.itemOrder);
      queryClient.setQueryData(['/api/user/sidebar-menu-order', user?.id], { itemOrder: normalizedOrder });
      setDraftMenuOrder(normalizedOrder);
      setIsEditingMenu(false);
      toast({
        title: t('sidebar.customize_saved', 'Sidebar saved'),
        description: t('sidebar.customize_saved_description', 'Your menu order has been updated.'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('sidebar.customize_save_error', 'Could not save sidebar'),
        description: error.message || t('sidebar.customize_save_error_description', 'Please try again.'),
        variant: 'destructive',
      });
    },
  });


  const getHelpSupportUrl = () => {
    if (helpSupportData?.helpSupportUrl) {
      return helpSupportData.helpSupportUrl;
    }

    return `https://docs.${window.location.hostname.replace(/^www\./, '')}`;
  };

  const {
    PERMISSIONS,
    hasAnyPermission,
  } = usePermissions();

  const canOpenErpDashboard = hasAnyPermission(ERP_DASHBOARD_ROUTE_PERMISSIONS);
  const { businessType: erpBusinessType } = useErpBusinessType();

  type ErpMenuItem = {
    href: string;
    icon: string;
    label: string;
    permissions: Permission[];
  };

  const standardErpMenuItems = useMemo<ErpMenuItem[]>(
    () => [
      { href: '/erp/dashboard', icon: 'ri-dashboard-line', label: t('erp.dashboard.title', 'Dashboard'), permissions: ERP_DASHBOARD_ROUTE_PERMISSIONS },
      { href: '/erp/products', icon: 'ri-shopping-bag-line', label: t('erp.products.title', 'Products'), permissions: [PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS] },
      { href: '/erp/sales-orders', icon: 'ri-file-list-2-line', label: t('erp.salesOrders.title', 'Sales Orders'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.CREATE_QUOTATIONS] },
      { href: '/erp/inventory', icon: 'ri-archive-line', label: t('erp.inventory.title', 'Inventory'), permissions: [PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.MANAGE_INVENTORY] },
      { href: '/erp/suppliers', icon: 'ri-user-star-line', label: t('erp.suppliers.title', 'Suppliers'), permissions: [PERMISSIONS.VIEW_SUPPLIERS, PERMISSIONS.MANAGE_SUPPLIERS] },
      { href: '/erp/purchase-orders', icon: 'ri-shopping-cart-line', label: t('erp.purchaseOrders.title', 'Purchase Orders'), permissions: [PERMISSIONS.VIEW_PURCHASE_ORDERS, PERMISSIONS.MANAGE_PURCHASE_ORDERS] },
      { href: '/erp/invoices', icon: 'ri-file-text-line', label: t('erp.invoices.title', 'Invoices'), permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS] },
      { href: '/erp/accounting', icon: 'ri-calculator-line', label: t('erp.accounting.title', 'Accounting'), permissions: [PERMISSIONS.VIEW_ACCOUNTING, PERMISSIONS.MANAGE_ACCOUNTING, PERMISSIONS.POST_JOURNAL_ENTRIES, PERMISSIONS.CLOSE_FISCAL_YEAR] },
      { href: '/erp/employees', icon: 'ri-team-line', label: t('erp.employees.title', 'Employees'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR] },
      { href: '/erp/hr', icon: 'ri-user-heart-line', label: t('erp.hr.title', 'HR'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR, PERMISSIONS.APPROVE_LEAVE] },
      { href: '/erp/payroll', icon: 'ri-money-dollar-circle-line', label: t('erp.payroll.title', 'Payroll'), permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL] },
      { href: '/erp/reports', icon: 'ri-bar-chart-box-line', label: t('erp.reports.title', 'Reports'), permissions: ERP_REPORTS_ROUTE_PERMISSIONS },
      { href: '/erp/settings', icon: 'ri-settings-3-line', label: t('erp.settings.title', 'ERP Settings'), permissions: [PERMISSIONS.VIEW_ERP_SETTINGS, PERMISSIONS.MANAGE_ERP_SETTINGS] },
    ],
    [PERMISSIONS, t]
  );

  const restaurantErpMenuItems = useMemo<ErpMenuItem[]>(
    () => [
      { href: '/erp/dashboard', icon: 'ri-dashboard-line', label: t('erp.dashboard.title', 'Dashboard'), permissions: ERP_DASHBOARD_ROUTE_PERMISSIONS },
      { href: '/erp/restaurant/table-floors', icon: 'ri-layout-5-line', label: t('erp.restaurant.tableFloors.menuLabel', 'Table/Floors'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.VIEW_ERP_SETTINGS, PERMISSIONS.MANAGE_ERP_SETTINGS] },
      { href: '/erp/restaurant/floor', icon: 'ri-layout-grid-line', label: t('erp.restaurant.floorPlan', 'Floor Plan'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/restaurant/kitchen', icon: 'ri-restaurant-2-line', label: t('erp.restaurant.kitchenDisplay', 'Kitchen Display'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/restaurant/dispatch', icon: 'ri-truck-line', label: t('erp.restaurant.dispatch', 'Dispatch'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/restaurant/pos', icon: 'ri-store-2-line', label: t('erp.restaurant.pos', 'POS / Cashier'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS] },
      { href: '/erp/restaurant/reservations', icon: 'ri-calendar-check-line', label: t('erp.restaurant.reservations', 'Reservations'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/restaurant/delivery', icon: 'ri-e-bike-2-line', label: t('erp.restaurant.delivery', 'Delivery'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/sales-orders', icon: 'ri-file-list-2-line', label: t('erp.salesOrders.title', 'Sales Orders'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.CREATE_QUOTATIONS] },
      { href: '/erp/invoices', icon: 'ri-file-text-line', label: t('erp.invoices.title', 'Invoices'), permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS] },
      { href: '/erp/products', icon: 'ri-shopping-bag-line', label: t('erp.products.title', 'Products'), permissions: [PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS] },
      { href: '/erp/inventory', icon: 'ri-archive-line', label: t('erp.inventory.title', 'Inventory'), permissions: [PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.MANAGE_INVENTORY] },
      { href: '/erp/suppliers', icon: 'ri-user-star-line', label: t('erp.suppliers.title', 'Suppliers'), permissions: [PERMISSIONS.VIEW_SUPPLIERS, PERMISSIONS.MANAGE_SUPPLIERS] },
      { href: '/erp/purchase-orders', icon: 'ri-shopping-cart-line', label: t('erp.purchaseOrders.title', 'Purchase Orders'), permissions: [PERMISSIONS.VIEW_PURCHASE_ORDERS, PERMISSIONS.MANAGE_PURCHASE_ORDERS] },
      { href: '/erp/accounting', icon: 'ri-calculator-line', label: t('erp.accounting.title', 'Accounting'), permissions: [PERMISSIONS.VIEW_ACCOUNTING, PERMISSIONS.MANAGE_ACCOUNTING, PERMISSIONS.POST_JOURNAL_ENTRIES, PERMISSIONS.CLOSE_FISCAL_YEAR] },
      { href: '/erp/employees', icon: 'ri-team-line', label: t('erp.employees.title', 'Employees'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR] },
      { href: '/erp/hr', icon: 'ri-user-heart-line', label: t('erp.hr.title', 'HR'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR, PERMISSIONS.APPROVE_LEAVE] },
      { href: '/erp/payroll', icon: 'ri-money-dollar-circle-line', label: t('erp.payroll.title', 'Payroll'), permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL] },
      { href: '/erp/reports', icon: 'ri-bar-chart-box-line', label: t('erp.reports.title', 'Reports'), permissions: ERP_REPORTS_ROUTE_PERMISSIONS },
      { href: '/erp/settings', icon: 'ri-settings-3-line', label: t('erp.settings.title', 'ERP Settings'), permissions: [PERMISSIONS.VIEW_ERP_SETTINGS, PERMISSIONS.MANAGE_ERP_SETTINGS] },
    ],
    [PERMISSIONS, t]
  );

  const dentalErpMenuItems = useMemo<ErpMenuItem[]>(
    () => [
      { href: '/erp/dashboard', icon: 'ri-dashboard-line', label: t('erp.dashboard.title', 'Dashboard'), permissions: ERP_DASHBOARD_ROUTE_PERMISSIONS },
      { href: '/erp/dental/patients', icon: 'ri-user-heart-line', label: t('erp.dental.patients.menuLabel', 'Patients'), permissions: [PERMISSIONS.VIEW_DENTAL_PATIENTS, PERMISSIONS.MANAGE_DENTAL_PATIENTS] },
      { href: '/erp/dental/schedule', icon: 'ri-calendar-check-line', label: t('erp.dental.schedule.menuLabel', 'Schedule'), permissions: [PERMISSIONS.VIEW_DENTAL_SCHEDULE, PERMISSIONS.MANAGE_DENTAL_SCHEDULE] },
      { href: '/erp/dental/queue', icon: 'ri-ticket-2-line', label: t('erp.dental.queue.title', 'Digital Turn'), permissions: [PERMISSIONS.VIEW_DENTAL_SCHEDULE, PERMISSIONS.MANAGE_DENTAL_SCHEDULE] },
      { href: '/erp/dental/treatment-plans', icon: 'ri-file-list-3-line', label: t('erp.dental.treatmentPlans.menuLabel', 'Treatment plans'), permissions: [PERMISSIONS.VIEW_DENTAL_TREATMENT_PLANS, PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS, PERMISSIONS.CREATE_QUOTATIONS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.VIEW_INVOICES] },
      { href: '/erp/sales-orders', icon: 'ri-file-list-2-line', label: t('erp.salesOrders.title', 'Sales Orders'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.CREATE_QUOTATIONS] },
      { href: '/erp/invoices', icon: 'ri-file-text-line', label: t('erp.invoices.title', 'Invoices'), permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS] },
      { href: '/erp/products', icon: 'ri-shopping-bag-line', label: t('erp.products.title', 'Products'), permissions: [PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS] },
      { href: '/erp/inventory', icon: 'ri-archive-line', label: t('erp.inventory.title', 'Inventory'), permissions: [PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.MANAGE_INVENTORY] },
      { href: '/erp/suppliers', icon: 'ri-user-star-line', label: t('erp.suppliers.title', 'Suppliers'), permissions: [PERMISSIONS.VIEW_SUPPLIERS, PERMISSIONS.MANAGE_SUPPLIERS] },
      { href: '/erp/purchase-orders', icon: 'ri-shopping-cart-line', label: t('erp.purchaseOrders.title', 'Purchase Orders'), permissions: [PERMISSIONS.VIEW_PURCHASE_ORDERS, PERMISSIONS.MANAGE_PURCHASE_ORDERS] },
      { href: '/erp/accounting', icon: 'ri-calculator-line', label: t('erp.accounting.title', 'Accounting'), permissions: [PERMISSIONS.VIEW_ACCOUNTING, PERMISSIONS.MANAGE_ACCOUNTING, PERMISSIONS.POST_JOURNAL_ENTRIES, PERMISSIONS.CLOSE_FISCAL_YEAR] },
      { href: '/erp/employees', icon: 'ri-team-line', label: t('erp.employees.title', 'Employees'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR] },
      { href: '/erp/hr', icon: 'ri-user-heart-line', label: t('erp.hr.title', 'HR'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR, PERMISSIONS.APPROVE_LEAVE] },
      { href: '/erp/payroll', icon: 'ri-money-dollar-circle-line', label: t('erp.payroll.title', 'Payroll'), permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL] },
      { href: '/erp/reports', icon: 'ri-bar-chart-box-line', label: t('erp.reports.title', 'Reports'), permissions: ERP_REPORTS_ROUTE_PERMISSIONS },
      { href: '/erp/dental/booking-settings', icon: 'ri-calendar-event-line', label: t('erp.dental.booking.settings.menuLabel', 'Booking settings (Specialists)'), permissions: [PERMISSIONS.VIEW_DENTAL_SCHEDULE, PERMISSIONS.MANAGE_DENTAL_SCHEDULE] },
      { href: '/erp/settings', icon: 'ri-settings-3-line', label: t('erp.settings.title', 'ERP Settings'), permissions: [PERMISSIONS.VIEW_ERP_SETTINGS, PERMISSIONS.MANAGE_ERP_SETTINGS] },
    ],
    [PERMISSIONS, t]
  );

  const realEstateErpMenuItems: ErpMenuItem[] = [
    { href: '/erp/real-estate/dashboard', icon: 'ri-dashboard-line', label: t('erp.realEstate.dashboard.title','Real Estate Dashboard'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_DASHBOARD,PERMISSIONS.MANAGE_REAL_ESTATE_DASHBOARD] },
    { href: '/erp/real-estate/properties', icon: 'ri-home-4-line', label: t('erp.realEstate.properties.title','Properties'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_PROPERTIES,PERMISSIONS.MANAGE_REAL_ESTATE_PROPERTIES] },
    { href: '/erp/real-estate/schedule', icon: 'ri-calendar-check-line', label: t('erp.realEstate.schedule.title','Schedule'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_SCHEDULE,PERMISSIONS.MANAGE_REAL_ESTATE_SCHEDULE] },
    { href: '/erp/real-estate/owners', icon: 'ri-user-star-line', label: t('erp.realEstate.owners.title','Owners'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_OWNERS,PERMISSIONS.MANAGE_REAL_ESTATE_OWNERS] },
    { href: '/erp/real-estate/tenants', icon: 'ri-group-line', label: t('erp.realEstate.tenants.title','Tenants'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_TENANTS,PERMISSIONS.MANAGE_REAL_ESTATE_TENANTS] },
    { href: '/erp/real-estate/leases', icon: 'ri-file-list-3-line', label: t('erp.realEstate.leases.title','Leases'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_LEASES,PERMISSIONS.MANAGE_REAL_ESTATE_LEASES] },
    { href: '/erp/real-estate/rent-collection', icon: 'ri-money-dollar-circle-line', label: t('erp.realEstate.rent_collection.title','Rent Collection'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_RENT_COLLECTION,PERMISSIONS.MANAGE_REAL_ESTATE_RENT_COLLECTION] },
    { href: '/erp/real-estate/maintenance', icon: 'ri-tools-line', label: t('erp.realEstate.maintenance.title','Maintenance'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_MAINTENANCE,PERMISSIONS.MANAGE_REAL_ESTATE_MAINTENANCE] },
    { href: '/erp/real-estate/inspections', icon: 'ri-survey-line', label: t('erp.realEstate.inspections.title','Inspections'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_INSPECTIONS,PERMISSIONS.MANAGE_REAL_ESTATE_INSPECTIONS] },
    { href: '/erp/real-estate/expenses', icon: 'ri-wallet-3-line', label: t('erp.realEstate.expenses.title','Expenses'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_EXPENSES,PERMISSIONS.MANAGE_REAL_ESTATE_EXPENSES] },
    { href: '/erp/real-estate/owner-settlements', icon: 'ri-bank-card-line', label: t('erp.realEstate.settlements.title','Owner Settlements'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_OWNER_SETTLEMENTS,PERMISSIONS.MANAGE_REAL_ESTATE_OWNER_SETTLEMENTS] },
    { href: '/erp/real-estate/projects', icon: 'ri-building-line', label: t('erp.realEstate.projects.title','Projects'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_PROJECTS,PERMISSIONS.MANAGE_REAL_ESTATE_PROJECTS] },
    { href: '/erp/real-estate/units', icon: 'ri-building-4-line', label: t('erp.realEstate.units.title','Units'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_UNITS,PERMISSIONS.MANAGE_REAL_ESTATE_UNITS] },
    { href: '/erp/real-estate/reservations', icon: 'ri-bookmark-3-line', label: t('erp.realEstate.reservations.title','Reservations'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_RESERVATIONS,PERMISSIONS.MANAGE_REAL_ESTATE_RESERVATIONS] },
    { href: '/erp/real-estate/payment-plans', icon: 'ri-file-chart-line', label: t('erp.realEstate.paymentPlans.title','Payment Plans'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_PAYMENT_PLANS,PERMISSIONS.MANAGE_REAL_ESTATE_PAYMENT_PLANS] },
    { href: '/erp/real-estate/vendors', icon: 'ri-truck-line', label: t('erp.realEstate.vendors.title','Vendors'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_VENDORS,PERMISSIONS.MANAGE_REAL_ESTATE_VENDORS] },
    { href: '/erp/real-estate/commissions', icon: 'ri-percent-line', label: t('erp.realEstate.commissions.title','Commissions'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_COMMISSIONS,PERMISSIONS.MANAGE_REAL_ESTATE_COMMISSIONS] },
    { href: '/erp/real-estate/documents', icon: 'ri-file-text-line', label: t('erp.realEstate.documents.title','Documents'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_DOCUMENTS,PERMISSIONS.MANAGE_REAL_ESTATE_DOCUMENTS] },
    { href: '/erp/real-estate/reports', icon: 'ri-bar-chart-grouped-line', label: t('erp.realEstate.reports.title','Reports'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_REPORTS,PERMISSIONS.MANAGE_REAL_ESTATE_REPORTS] },
    { href: '/erp/real-estate/settings', icon: 'ri-settings-3-line', label: t('erp.realEstate.settings.title','Real Estate Settings'), permissions: [PERMISSIONS.VIEW_REAL_ESTATE_SETTINGS,PERMISSIONS.MANAGE_REAL_ESTATE_SETTINGS] },
    { href: '/erp/settings', icon: 'ri-settings-3-line', label: t('erp.settings.title','ERP Settings'), permissions: [PERMISSIONS.VIEW_ERP_SETTINGS,PERMISSIONS.MANAGE_ERP_SETTINGS] },
  ];
  const currentErpMenuItems = erpBusinessType === 'real_estate' ? realEstateErpMenuItems :
    erpBusinessType === 'restaurant'
      ? restaurantErpMenuItems
      : erpBusinessType === 'dental'
        ? dentalErpMenuItems
        : standardErpMenuItems;

  const erpExpandedMenuItems = useMemo(
    () => currentErpMenuItems.filter((item) => hasAnyPermission(item.permissions)),
    [currentErpMenuItems, hasAnyPermission],
  );

  const erpModuleFallbackHref = useMemo(() => {
    const currentAllowedRoute = erpExpandedMenuItems.find((item) => location.startsWith(item.href));
    return currentAllowedRoute?.href ?? erpExpandedMenuItems[0]?.href ?? '/erp/dashboard';
  }, [location, erpExpandedMenuItems]);

  const erpCollapsedHref = useMemo(() => {
    if (erpBusinessType !== 'restaurant' && canOpenErpDashboard) return '/erp/dashboard';
    return erpModuleFallbackHref;
  }, [erpBusinessType, canOpenErpDashboard, erpModuleFallbackHref]);

  const erpTopLevelHref =
    erpBusinessType !== 'restaurant' && canOpenErpDashboard ? '/erp/dashboard' : erpModuleFallbackHref;

  const { onMessage } = useSocket('/ws');

  useEffect(() => {
    const unsubscribeChannelCreated = onMessage('channelConnectionCreated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });

    const unsubscribeChannelUpdated = onMessage('channelConnectionUpdated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });

    const unsubscribeChannelDeleted = onMessage('channelConnectionDeleted', (data) => {
      if (data.data?.id === activeChannelId) {
        setActiveChannelId(null);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });


    const unsubscribeWhatsAppStatus = onMessage('whatsappConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });

    const unsubscribeInstagramStatus = onMessage('instagramConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });

    const unsubscribeMessengerStatus = onMessage('messengerConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });


    const unsubscribeSubscriptionStatus = onMessage('subscription_status_changed', (data) => {


      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
    });


    const unsubscribePlanUpdated = onMessage('plan_updated', (data) => {


      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-status'] });
    });

    return () => {
      unsubscribeChannelCreated();
      unsubscribeChannelUpdated();
      unsubscribeChannelDeleted();
      unsubscribeWhatsAppStatus();
      unsubscribeInstagramStatus();
      unsubscribeMessengerStatus();
      unsubscribeSubscriptionStatus();
      unsubscribePlanUpdated();
    };
  }, [onMessage, queryClient, company?.id, activeChannelId, setActiveChannelId]);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    checkIfMobile();

    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Give clinical workspaces maximum width when an odontogram or patient detail opens.
  useEffect(() => {
    const isDentalPatientDetail = /^\/erp\/dental\/patients\/\d+(?:\/|$)/.test(location);
    if (location.startsWith('/erp/dental/chart') || isDentalPatientDetail) {
      setIsCollapsed(true);
    }
  }, [location, setIsCollapsed]);

  const { data: channelConnections = [] } = useQuery<any[]>({
    queryKey: ['/api/channel-connections', company?.id],
    refetchOnWindowFocus: false, // Disable to prevent excessive refetching
    refetchOnReconnect: false, // Disable to prevent excessive refetching
    staleTime: 1000 * 60 * 5, // Increase stale time to 5 minutes
    enabled: !!company
  });

  const handleChannelClick = (channelId: number) => {

    const connection = channelConnections?.find((conn: any) => conn.id === channelId);

    if (connection?.channelType === 'email') {

      setLocation(`/email/${channelId}`);
      setActiveChannelId(channelId);
    } else {

      if (activeChannelId === channelId) {
        setActiveChannelId(null);
      } else {
        setActiveChannelId(channelId);
      }

      if (location !== '/inbox') {
        setLocation('/inbox');
      }
    }
  };

  const companyStyle = isDark
    ? {
        sidebarBg: { backgroundColor: 'hsl(var(--card))' },
        sidebarHover: { backgroundColor: 'hsl(var(--accent))' },
        activeItem: { backgroundColor: 'hsl(var(--accent))' },
        toggleButton: { backgroundColor: 'hsl(var(--accent))' },
        toggleButtonHover: { backgroundColor: 'hsl(var(--accent))' },
        toggleButtonBorder: { borderColor: 'hsl(var(--border))' },
        textColor: 'text-white',
        mutedText: 'text-white/65'
      }
    : {
        sidebarBg: { backgroundColor: '#f8fafc' },
        sidebarHover: { backgroundColor: '#e2e8f0' },
        activeItem: { backgroundColor: '#e3ecff', color: '#0f172a' },
        toggleButton: { backgroundColor: '#ffffff', color: '#0f172a' },
        toggleButtonHover: { backgroundColor: '#eff4ff' },
        toggleButtonBorder: { borderColor: '#cbd5f5' },
        textColor: 'text-gray-900',
        mutedText: 'text-gray-600'
      };

  function adjustColor(color: string, amount: number): string {
    try {
      color = color.replace('#', '');

      let r = parseInt(color.substring(0, 2), 16);
      let g = parseInt(color.substring(2, 4), 16);
      let b = parseInt(color.substring(4, 6), 16);

      r = Math.max(0, Math.min(255, r + amount));
      g = Math.max(0, Math.min(255, g + amount));
      b = Math.max(0, Math.min(255, b + amount));

      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch (error) {
      return '#1f2937';
    }
  }


  const getDaysRemaining = () => {
    if (!subscriptionStatus) return null;

    const { daysUntilExpiry, nextBillingDate, gracePeriodActive, gracePeriodDaysRemaining, isActive } = subscriptionStatus;


    if (gracePeriodActive && gracePeriodDaysRemaining !== undefined) {
      return gracePeriodDaysRemaining;
    }


    if (!isActive) {
      return 0;
    }


    if (daysUntilExpiry !== undefined) {
      return daysUntilExpiry;
    }


    if (nextBillingDate) {
      const renewalDate = new Date(nextBillingDate);
      const today = new Date();
      const diffTime = renewalDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    }

    return null;
  };

  const getRenewalDisplayInfo = () => {
    if (!subscriptionStatus) return null;


    if (renewalStatus && !renewalStatus.expirationStatus.renewalRequired) {
      return null;
    }

    const { daysUntilExpiry, nextBillingDate, gracePeriodActive, gracePeriodDaysRemaining, isActive } = subscriptionStatus;
    

    const isLifetime = company?.plan && isLifetimePlan(company.plan);
    

    if (isLifetime) {
      return {
        text: t('nav.lifetime_plan', 'Lifetime plan'),
        color: 'text-green-400',
        icon: 'ri-infinity-line'
      };
    }

    if (gracePeriodActive && gracePeriodDaysRemaining !== undefined) {
      return {
        text: `${t('nav.grace_period', 'Grace period')}: ${gracePeriodDaysRemaining} ${gracePeriodDaysRemaining === 1 ? 'day' : 'days'}`,
        color: 'text-amber-400',
        icon: 'ri-time-line'
      };
    }

    if (!isActive) {
      return {
        text: t('nav.subscription_expired', 'Subscription expired'),
        color: 'text-red-400',
        icon: 'ri-alert-line'
      };
    }

    if (daysUntilExpiry !== undefined) {
      if (daysUntilExpiry <= 7) {
        return {
          text: `${t('nav.expires_in', 'Expires in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-red-400',
          icon: 'ri-alarm-warning-line'
        };
      } else if (daysUntilExpiry <= 30) {
        return {
          text: `${t('nav.expires_in', 'Expires in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-amber-400',
          icon: 'ri-time-line'
        };
      } else {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-green-400',
          icon: 'ri-refresh-line'
        };
      }
    }

    if (nextBillingDate) {
      const renewalDate = new Date(nextBillingDate);
      const today = new Date();
      const diffTime = renewalDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        return {
          text: t('nav.renewal_due', 'Renewal due'),
          color: 'text-red-400',
          icon: 'ri-alert-line'
        };
      } else if (diffDays <= 7) {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-red-400',
          icon: 'ri-alarm-warning-line'
        };
      } else if (diffDays <= 30) {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-amber-400',
          icon: 'ri-time-line'
        };
      } else {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-green-400',
          icon: 'ri-refresh-line'
        };
      }
    }

    return null;
  };

  const handleManualRenewal = () => {
    requestManualRenewal();
  };

  const isSubscriptionExpired = () => {
    return subscriptionStatus &&
           !subscriptionStatus.isActive &&
           (subscriptionStatus.status === 'expired' ||
            subscriptionStatus.status === 'cancelled' ||
            subscriptionStatus.status === 'past_due');
  };

  const navItemClass = (active: boolean, nested = false) =>
    `group relative flex h-9 w-full items-center rounded-lg border border-transparent text-sm font-medium transition-colors ${
      isCollapsed ? 'justify-center px-0' : nested ? 'px-2 ps-8' : 'px-2'
    } ${
      active
        ? isDark
          ? 'text-white shadow-sm'
          : 'text-gray-900 shadow-sm bg-white/70'
        : isDark
          ? 'text-white/65 hover:border-white/5 hover:bg-white/[0.07] hover:text-white'
          : 'text-gray-600 hover:bg-white hover:text-gray-900'
    }`;

  const navLabelClass = `min-w-0 flex-1 truncate ms-2.5 ${isCollapsed ? 'sr-only' : 'block'}`;
  const unreadBadgeClass = `ml-auto flex items-center justify-center rounded-full text-[11px] font-bold bg-[#21c063] text-white min-w-5 h-5 px-1.5`;

  const collapsedTitle = (label: string) => (isCollapsed ? label : undefined);

  const channelItemClass = (active: boolean) =>
    `group relative flex ${isCollapsed ? 'h-12 w-12' : 'h-14 w-full'} items-center rounded-xl border transition-all duration-200 ${
      isCollapsed ? 'justify-center' : 'px-3 gap-3'
    } ${
      active
        ? isDark
          ? 'border-[#0ea5e9] bg-[#0ea5e9]/10 text-white shadow-[0_0_15px_rgba(14,165,233,0.1)]'
          : 'border-[#0ea5e9] bg-[#e0f2fe] text-[#0f172a] shadow-sm'
        : isDark
          ? 'border-transparent text-white/70 hover:bg-white/[0.05] hover:text-white'
          : 'border-transparent text-gray-600 hover:bg-white hover:text-gray-900'
    }`;

  const utilityItemClass = (active: boolean) =>
    `group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 transition-all ${
      isDark ? 'hover:bg-white/[0.05]' : 'hover:bg-white'
    } ${
      active ? (isDark ? 'text-white' : 'text-gray-900') : isDark ? 'text-white/70' : 'text-gray-600'
    }`;

  const utilitySectionActive = location === '/pages' || location === '/settings' || location.startsWith('/settings?');

  const topLevelMenuCatalog = useMemo<TopLevelSidebarItem[]>(() => [
    { id: 'inbox', href: '/inbox', icon: InboxConversationIcon, label: t('nav.inbox', 'Inbox'), active: (path) => path === '/inbox' },
    { id: 'flows', href: '/flows', icon: 'ri-node-tree', label: t('nav.flow_builder', 'Flow Builder'), permissions: [PERMISSIONS.VIEW_FLOWS, PERMISSIONS.MANAGE_FLOWS], active: (path) => path === '/flows' },
    { id: 'contacts', href: '/contacts', icon: 'ri-contacts-book-2-line', label: t('nav.contacts', 'Contacts'), permissions: [PERMISSIONS.VIEW_CONTACTS, PERMISSIONS.MANAGE_CONTACTS], active: (path) => path === '/contacts' },
    { id: 'pipeline', href: '/pipeline', icon: 'ri-kanban-view-2', label: t('nav.pipeline', 'Pipeline'), permissions: [PERMISSIONS.VIEW_PIPELINE, PERMISSIONS.MANAGE_PIPELINE], active: (path) => path === '/pipeline' },
    { id: 'tasks', href: '/tasks', icon: ListTodo, label: t('nav.tasks', 'Tasks'), permissions: [PERMISSIONS.VIEW_TASKS, PERMISSIONS.MANAGE_TASKS], active: (path) => path === '/tasks' },
    { id: 'calendar', href: '/calendar', icon: 'ri-calendar-event-fill', label: t('nav.calendar', 'Calendar'), permissions: [PERMISSIONS.VIEW_CALENDAR, PERMISSIONS.MANAGE_CALENDAR], active: (path) => path === '/calendar' },
    {
      id: 'campaigns', href: '/campaigns', icon: 'ri-advertisement-fill', label: t('nav.campaigns', 'Campaigns'),
      permissions: [PERMISSIONS.VIEW_CAMPAIGNS, PERMISSIONS.CREATE_CAMPAIGNS, PERMISSIONS.EDIT_CAMPAIGNS, PERMISSIONS.DELETE_CAMPAIGNS, PERMISSIONS.MANAGE_TEMPLATES, PERMISSIONS.MANAGE_SEGMENTS, PERMISSIONS.VIEW_CAMPAIGN_ANALYTICS, PERMISSIONS.MANAGE_WHATSAPP_ACCOUNTS, PERMISSIONS.CONFIGURE_CHANNELS],
      active: (path) => path.startsWith('/campaigns'),
    },
    { id: 'call_logs', href: '/call-logs', icon: 'ri-phone-fill', label: t('nav.call_logs', 'Call Logs'), permissions: [PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS], active: (path) => path.startsWith('/call-logs') },
    { id: 'templates', href: '/templates', icon: 'ri-draft-fill', label: t('nav.templates', 'Templates'), permissions: [PERMISSIONS.MANAGE_TEMPLATES], active: (path) => path === '/templates' },
    { id: 'analytics', href: '/analytics', icon: 'ri-bar-chart-2-line', label: t('nav.analytics', 'Analytics'), permissions: [PERMISSIONS.VIEW_ANALYTICS, PERMISSIONS.VIEW_DETAILED_ANALYTICS], active: (path) => path === '/analytics' },
    { id: 'reports', href: '/reports', icon: 'ri-pie-chart-2-fill', label: t('nav.reports', 'Reports'), permissions: [PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS, PERMISSIONS.VIEW_RESPONSE_TIME_REPORTS], active: (path) => path === '/reports' },
    { id: 'captured_data', href: '/captured-data', icon: 'ri-database-2-fill', label: t('nav.captured_data', 'Captured Data'), permissions: [PERMISSIONS.VIEW_CAPTURED_DATA, PERMISSIONS.MANAGE_CAPTURED_DATA], active: (path) => path === '/captured-data' },
    { id: 'erp', href: erpTopLevelHref, icon: 'ri-building-3-fill', label: t('erp.nav.title', 'ERP'), permissions: ERP_ACCESS_PERMISSIONS, active: (path) => path.startsWith('/erp'), kind: 'erp' },
  ], [PERMISSIONS, erpTopLevelHref, t]);

  const visibleTopLevelMenuItems = useMemo(() => {
    const itemById = new Map(topLevelMenuCatalog.map((item) => [item.id, item]));
    return draftMenuOrder
      .map((id) => itemById.get(id))
      .filter((item): item is TopLevelSidebarItem => !!item)
      .filter((item) => !item.permissions || hasAnyPermission(item.permissions));
  }, [draftMenuOrder, hasAnyPermission, topLevelMenuCatalog]);

  useEffect(() => {
    if (!isEditingMenu) setDraftMenuOrder(savedMenuOrder);
  }, [isEditingMenu, savedMenuOrder]);

  useEffect(() => {
    if (!isEditingMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDraftMenuOrder(savedMenuOrder);
        setIsEditingMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditingMenu, savedMenuOrder]);

  useEffect(() => {
    if (isCollapsed && isEditingMenu) {
      setDraftMenuOrder(savedMenuOrder);
      setIsEditingMenu(false);
    }
  }, [isCollapsed, isEditingMenu, savedMenuOrder]);

  const startEditingMenu = () => {
    setDraftMenuOrder(savedMenuOrder);
    setErpExpanded(false);
    setIsEditingMenu(true);
  };

  const handleMenuDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const visibleIds = new Set(visibleTopLevelMenuItems.map((item) => item.id));
    setDraftMenuOrder((current) => reorderVisibleSidebarItems(
      current,
      visibleIds,
      result.source.index,
      result.destination!.index,
    ));
  };

  const renderDragHandle = (label: string, dragHandleProps?: DraggableProvidedDragHandleProps | null) => (
    <span
      {...dragHandleProps}
      className={`ms-auto flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md active:cursor-grabbing ${
        isDark ? 'text-white/55 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-white hover:text-gray-900'
      }`}
      aria-label={`${t('sidebar.drag_to_reorder', 'Drag to reorder')}: ${label}`}
      title={t('sidebar.drag_to_reorder', 'Drag to reorder')}
    >
      <i className="ri-draggable text-lg" />
    </span>
  );

  const renderTopLevelMenuItem = (
    item: TopLevelSidebarItem,
    dragHandleProps?: DraggableProvidedDragHandleProps | null,
  ) => {
    const active = item.active(location);
    const Icon = item.icon;
    const menuIcon = typeof Icon === 'string'
      ? <i className={`${Icon} text-xl`} />
      : <Icon className="h-5 w-5 shrink-0" aria-hidden="true" focusable="false" />;

    if (isEditingMenu) {
      return (
        <div
          className={`${navItemClass(active)} cursor-default select-none`}
          style={active ? companyStyle.activeItem : {}}
        >
          {menuIcon}
          <span className={navLabelClass}>{item.label}</span>
          {item.id === 'inbox' && totalUnreadCount > 0 && (
            <span className={`${unreadBadgeClass} ml-2`}>{totalUnreadCount > 99 ? '99+' : totalUnreadCount}</span>
          )}
          {renderDragHandle(item.label, dragHandleProps)}
        </div>
      );
    }

    if (item.kind === 'erp') {
      if (isCollapsed) {
        return (
          <Link href={erpCollapsedHref} className={navItemClass(active)} style={active ? companyStyle.activeItem : {}} title={collapsedTitle(item.label)}>
            <i className="ri-building-line text-xl" />
          </Link>
        );
      }

      return (
        <div className="flex flex-col space-y-0.5">
          <div
            className={`flex h-9 w-full items-stretch overflow-hidden rounded-lg border border-transparent transition-colors ${
              active
                ? isDark ? 'text-white shadow-sm' : 'bg-white/70 text-gray-900 shadow-sm'
                : isDark ? 'text-white/65 hover:bg-white/[0.07] hover:text-white' : 'text-gray-600 hover:bg-white hover:text-gray-900'
            }`}
            style={active ? companyStyle.activeItem : {}}
          >
            <Link href={erpTopLevelHref} onClick={() => setErpExpanded(true)} className="flex min-w-0 flex-1 items-center px-2 text-left">
              <i className="ri-building-3-fill shrink-0 text-xl" />
              <span className="ms-2.5 flex-1 truncate">{item.label}</span>
            </Link>
            <button
              type="button"
              onClick={() => setErpExpanded(!erpExpanded)}
              className={`flex shrink-0 items-center px-2 ${erpExpanded ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900')}`}
              aria-expanded={erpExpanded}
              aria-label={erpExpanded ? t('erp.nav.collapseMenu', 'Collapse ERP menu') : t('erp.nav.expandMenu', 'Expand ERP menu')}
            >
              <i className={`ri-arrow-down-s-line text-lg transition-transform ${erpExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {erpExpanded && erpExpandedMenuItems.map((erpItem) => (
            <Link
              key={erpItem.href}
              href={erpItem.href}
              className={navItemClass(location.startsWith(erpItem.href), true)}
              style={location.startsWith(erpItem.href) ? companyStyle.activeItem : {}}
              title={collapsedTitle(erpItem.label)}
            >
              <i className={`${erpItem.icon.includes('-line') ? erpItem.icon.replace('-line', '-fill') : erpItem.icon} text-xl`} />
              <span className={navLabelClass}>{erpItem.label}</span>
            </Link>
          ))}
        </div>
      );
    }

    return (
      <Link data-tour-nav={item.id} href={item.href} className={`${navItemClass(active)} ${item.id === 'inbox' ? 'relative' : ''}`} style={active ? companyStyle.activeItem : {}} title={collapsedTitle(item.label)}>
        {menuIcon}
        <span className={navLabelClass}>{item.label}</span>
        {item.id === 'inbox' && totalUnreadCount > 0 && (
          <span className={`${unreadBadgeClass} ${isCollapsed ? '' : 'ml-2'}`}>{totalUnreadCount > 99 ? '99+' : totalUnreadCount}</span>
        )}
      </Link>
    );
  };

  return (
    <nav
      className={`relative flex h-screen flex-shrink-0 flex-col overflow-hidden border-e ${
        companyStyle.textColor ?? 'text-white'
      } shadow-xl transition-[width] duration-300 ease-in-out ${isCollapsed ? 'w-[4.75rem]' : 'w-72'}`}
      style={companyStyle.sidebarBg}
    >
      <div className={`flex h-14 shrink-0 items-center border-b ${isDark ? 'border-white/10' : 'border-slate-200'} ${isCollapsed ? 'justify-center px-2' : 'gap-2 px-3'}`}>
        {isCollapsed && (
          branding.faviconUrl || company?.logo || branding.logoUrl ? (
            <img
              src={branding.faviconUrl || company?.logo || branding.logoUrl}
              alt={company?.name || branding.appName}
              className="h-9 w-9 rounded-lg object-contain"
              title={company?.name || branding.appName}
            />
          ) : (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
              style={{
                backgroundColor: company?.primaryColor || branding.primaryColor,
                color: getContrastingTextColor(company?.primaryColor || branding.primaryColor),
              }}
              title={company?.name || branding.appName}
            >
              {(company?.name || branding.appName || 'P').charAt(0).toUpperCase()}
            </span>
          )
        )}
        {!isCollapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {company?.logo || branding.logoUrl ? (
              <img
                src={company?.logo || branding.logoUrl}
                alt={company?.name || branding.appName}
                className="h-12 w-full max-w-full object-contain object-left"
              />
            ) : (
              <>
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                  style={{
                    backgroundColor: company?.primaryColor || branding.primaryColor,
                    color: getContrastingTextColor(company?.primaryColor || branding.primaryColor),
                  }}
                >
                  {(company?.name || branding.appName || 'P').charAt(0).toUpperCase()}
                </span>
             <span className={`truncate text-sm font-semibold tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}>{company?.name || branding.appName}</span>
              </>
            )}
            <button
              type="button"
              onClick={() => isEditingMenu ? saveSidebarMenuMutation.mutate(draftMenuOrder) : startEditingMenu()}
              disabled={saveSidebarMenuMutation.isPending || isSidebarMenuPreferencePending || isSidebarMenuPreferenceError}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-wait disabled:opacity-60 ${
                isDark
                  ? 'border-white/10 text-white/65 hover:bg-white/10 hover:text-white'
                  : 'border-slate-200 text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
              aria-label={isEditingMenu ? t('sidebar.save_order', 'Save sidebar order') : t('sidebar.customize', 'Customize sidebar')}
              title={isEditingMenu ? t('sidebar.save_order', 'Save sidebar order') : t('sidebar.customize', 'Customize sidebar')}
            >
              <i className={`${saveSidebarMenuMutation.isPending || isSidebarMenuPreferencePending ? 'ri-loader-4-line animate-spin' : isEditingMenu ? 'ri-save-line' : 'ri-edit-line'} text-base`} />
            </button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="company-sidebar-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {isEditingMenu ? (
          <>
            <div className="mb-2 flex items-center justify-between px-2">
              <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                {t('sidebar.customize_hint', 'Drag items to reorder · Esc to cancel')}
              </span>
              <button
                type="button"
                onClick={() => setDraftMenuOrder([...SIDEBAR_MENU_ITEM_IDS])}
                className={`text-xs font-medium ${isDark ? 'text-sky-300 hover:text-sky-200' : 'text-blue-600 hover:text-blue-700'}`}
              >
                {t('sidebar.reset_order', 'Reset to default')}
              </button>
            </div>
            <DragDropContext onDragEnd={handleMenuDragEnd}>
              <Droppable droppableId="company-sidebar-menu">
                {(droppableProvided) => (
                  <div
                    ref={droppableProvided.innerRef}
                    {...droppableProvided.droppableProps}
                    className="flex flex-col space-y-0.5"
                  >
                    {visibleTopLevelMenuItems.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(draggableProvided, snapshot) => (
                          <div
                            ref={draggableProvided.innerRef}
                            {...draggableProvided.draggableProps}
                            style={draggableProvided.draggableProps.style}
                            className={snapshot.isDragging ? 'z-50 rounded-lg shadow-xl' : undefined}
                          >
                            {renderTopLevelMenuItem(item, draggableProvided.dragHandleProps)}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {droppableProvided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </>
        ) : (
          <div className="flex flex-col space-y-0.5">
            {visibleTopLevelMenuItems.map((item) => (
              <React.Fragment key={item.id}>{renderTopLevelMenuItem(item)}</React.Fragment>
            ))}
          </div>
        )}

        <PermissionGate permissions={[PERMISSIONS.VIEW_CHANNELS, PERMISSIONS.MANAGE_CHANNELS]}>
          <div className={`mt-5 border-t ${isDark ? 'border-white/10' : 'border-slate-200'} pt-4`}>
            <h3 className={`mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${
              isDark ? 'text-white/35' : 'text-gray-500'
            } ${isCollapsed ? 'hidden' : 'block'}`}>
              {t('nav.channels', 'Channels')}
            </h3>
            <div className="flex flex-col space-y-0.5">
              {channelConnections.map((connection: any) => {
                let icon: string | React.ComponentType<any>;
                let color: string;
                let isComponent = false;

                switch(connection.channelType) {
                  case 'whatsapp_official':
                    icon = "ri-whatsapp-line";
                    color = "#25D366";
                    break;
                  case 'whatsapp_unofficial':
                    icon = "ri-whatsapp-line";
                    color = "#25D366";
                    break;
                  case 'messenger':
                    icon = "ri-messenger-line";
                    color = "#1877F2";
                    break;
                  case 'instagram':
                    icon = "ri-instagram-line";
                    color = "#E4405F";
                    break;
                  case 'tiktok':
                    icon = "ri-tiktok-line";
                    color = "#ffffff"; // Always white in sidebar to match sidebar text colors
                    break;
                  case 'telegram':
                    icon = "ri-telegram-line";
                    color = "#0088CC";
                    break;
                  case 'email':
                    icon = "ri-mail-line";
                    color = "#0078D4";
                    break;
                  case 'twilio_sms':
                  case 'twilio_voice':
                    icon = TwilioIcon;
                    isComponent = true;
                    color = "#ffffff"; // Always white in sidebar to match sidebar text colors
                    break;
                  case 'webchat':
                    icon = InboxConversationIcon;
                    isComponent = true;
                    color = "#6366f1";
                    break;
                  
                  default:
                    icon = InboxConversationIcon;
                    isComponent = true;
                    color = "#a1f15bff";
                }

                const isActive = activeChannelId === connection.id;
                const IconComponent = isComponent ? icon as React.ComponentType<any> : null;

                const statusDotColor = connection.status === 'active'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]'
                  : 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]';

                return (
                  <button
                    key={connection.id}
                    className={`${navItemClass(isActive)} relative`}
                    style={isActive ? companyStyle.activeItem : {}}
                    onClick={() => handleChannelClick(connection.id)}
                    title={isCollapsed ? connection.accountName : undefined}
                  >
                    {connection.channelType === 'webchat' ? (
                      <img
                        src={APP_ICONS.webchat}
                        alt={t('nav.webchat', 'Web chat')}
                        className="h-4 w-4 rounded"
                      />
                    ) : isComponent && IconComponent ? (
                      <IconComponent className="h-4 w-4" />
                    ) : (
                      <i className={`${icon} text-xl`} style={{ color: isActive ? 'white' : color }}></i>
                    )}
                    {isCollapsed ? null : (
                      <span className={`${navLabelClass} text-left`}> {connection.accountName?.length > 20 ? `${connection.accountName.slice(0, 20)}…` : connection.accountName}</span>
                    )}
                    <span
                      className={`absolute rounded-full ${statusDotColor}`}
                      style={{
                        width: isCollapsed ? '0.3rem' : '0.55rem',
                        height: isCollapsed ? '0.3rem' : '0.55rem',
                        right: isCollapsed ? '0.35rem' : '0.6rem',
                        top: '50%',
                        transform: 'translateY(-50%)'
                      }}
                    ></span>
                  </button>
                );
              })}
            </div>
          </div>
        </PermissionGate>
        </div>

        <div className={`shrink-0 border-t ${isDark ? 'border-white/10 bg-black/5' : 'border-slate-200 bg-white/70'} ${isCollapsed ? 'p-2' : 'p-3'}`}>
          <TrialStatus isCollapsed={isCollapsed} />

          <div className="flex flex-col space-y-0.5">
            <div
              className={`${navItemClass(utilitySectionActive)} items-center`}
              style={utilitySectionActive ? companyStyle.activeItem : {}}
            >
              {!isCollapsed && (
                <Link
                  href="/settings"
                  className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                    isDark
                      ? 'border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                      : 'border-slate-200 text-gray-600 hover:bg-white'
                  }`}
                  onClick={(event) => event.stopPropagation()}
                  title={collapsedTitle(t('nav.settings', 'Settings'))}
                >
                  <i className="ri-settings-3-line text-lg"></i>
                </Link>
              )}
              <button
                type="button"
                className={`${!isCollapsed ? 'ml-2 flex flex-1 items-center justify-between text-left' : 'flex w-full items-center justify-center text-left'}`}
                onClick={() => setUtilityExpanded((expanded) => !expanded)}
                aria-expanded={utilityExpanded}
                aria-label={utilityExpanded ? t('nav.utility_collapse', 'Collapse utility menu') : t('nav.utility_expand', 'Expand utility menu')}
                title={collapsedTitle(t('nav.utility_menu', 'Utility menu'))}
              >
            <span className={`${navLabelClass} ${isCollapsed ? 'sr-only' : ''}`}>{t('nav.utility_menu', 'More')}</span>
                {isCollapsed ? (
                  <i className="ri-more-2-line text-xl"></i>
                ) : (
                  <i className={`ri-arrow-down-s-line text-lg transition-transform ${utilityExpanded ? 'rotate-180' : ''}`} />
                )}
              </button>
            </div>

            {utilityExpanded && (
              <div className="flex flex-col space-y-0.5">
                <PermissionGate permissions={[PERMISSIONS.VIEW_PAGES, PERMISSIONS.MANAGE_PAGES]}>
                  <Link
                    href="/pages"
                    className={navItemClass(location === '/pages', !isCollapsed)}
                    style={location === '/pages' ? companyStyle.activeItem : {}}
                    title={collapsedTitle(t('nav.pages', 'Pages'))}
                  >
                    <i className="ri-book-2-fill text-xl"></i>
                    <span className={navLabelClass}>{t('nav.pages', 'Pages')}</span>
                  </Link>
                </PermissionGate>

                <PermissionGate permissions={[PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]}>
                  <Link
                    href="/settings"
                    className={navItemClass(location === '/settings', !isCollapsed)}
                    style={location === '/settings' ? companyStyle.activeItem : {}}
                    title={collapsedTitle(t('nav.settings', 'Settings'))}
                  >
                    <i className="ri-settings-4-line text-xl"></i>
                    <span className={navLabelClass}>{t('nav.settings', 'Settings')}</span>
                  </Link>
                </PermissionGate>
                <a
                  href={getHelpSupportUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={navItemClass(false, !isCollapsed)}
                  title={collapsedTitle(t('nav.help_support', 'Help & Support'))}
                >
                  <i className="ri-question-answer-line text-xl"></i>
                  <span className={navLabelClass}>{t('nav.help_support', 'Help & Support')}</span>
                </a>

                <Link
                  href="/settings?tab=billing"
                  className={navItemClass(location === '/settings?tab=billing', !isCollapsed)}
                  title={collapsedTitle(t('nav.billing', 'Billing & Subscription'))}
                >
                  <i className="ri-cash-line text-xl"></i>
                  <span className={navLabelClass}>{t('nav.billing', 'Billing & Subscription')}</span>
                </Link>
                {company && !isCollapsed && (
                  <div
                    className={`mt-3 rounded-xl border p-3 text-xs ${
                      isDark
                        ? 'border-white/10 bg-white/[0.05] text-white/55'
                        : 'border-slate-200 bg-white text-gray-600 shadow-sm'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className={`truncate font-medium ${isDark ? 'text-white/85' : 'text-gray-900'}`}>{company.name}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t('nav.plan', 'Plan')}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 capitalize ${
                            isDark ? 'border-white/10 bg-white/[0.06] text-white/75' : 'border-blue-200 bg-blue-50 text-blue-700'
                          }`}
                        >
                          {company.plan}
                        </span>
                      </div>

                      {(() => {
                        const renewalInfo = getRenewalDisplayInfo();
                        return renewalInfo ? (
                          <div
                            className={`flex items-center gap-1.5 border-t pt-1.5 ${
                              isDark ? 'border-white/10' : 'border-slate-200'
                            } ${renewalInfo.color}`}
                          >
                            <i className={`${renewalInfo.icon} text-xs`}></i>
                            <span>{renewalInfo.text}</span>
                          </div>
                        ) : null;
                      })()}

                      {isSubscriptionExpired() && (
                        <button
                          onClick={handleManualRenewal}
                          className={`mt-2 flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            isDark ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-500 text-white hover:bg-red-600'
                          }`}
                        >
                          <i className="ri-refresh-line text-sm"></i>
                          <span>{t('nav.renew_subscription', 'Renew Subscription')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
