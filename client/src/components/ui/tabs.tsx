import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import type { LucideIcon } from 'lucide-react'

import { cn } from "@/lib/utils"
import { TabsScrollArea } from './tabs-scroll-area'
import { useTranslation } from '@/hooks/use-translation'

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, dir, ...props }, ref) => {
  const { currentLanguage } = useTranslation()
  return <TabsPrimitive.Root ref={ref} dir={dir ?? (currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr')} className={cn('min-w-0', className)} {...props} />
})
Tabs.displayName = TabsPrimitive.Root.displayName

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsScrollArea>
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      className={cn(
        "app-tabs-list",
        className
      )}
      {...props}
    />
  </TabsScrollArea>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { icon?: LucideIcon }
>(({ className, icon: Icon, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      "app-tabs-trigger",
      className
    )}
    {...props}
  >
    {Icon ? <><Icon aria-hidden="true" focusable="false" />{children}</> : children}
  </TabsPrimitive.Trigger>
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
