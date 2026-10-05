"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { DialogPortalContainerContext } from "@/components/ui/dialog-portal-context"

type SelectSearchContextValue = {
  search: string
  searchable: boolean
}

const SelectSearchContext = React.createContext<SelectSearchContextValue>({
  search: "",
  searchable: false,
})

function getNodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join(" ")
  if (React.isValidElement(node)) {
    return getNodeText((node.props as { children?: React.ReactNode }).children)
  }
  return ""
}

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

type SelectContentProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  searchable?: boolean
  searchPlaceholder?: string
}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({
  className,
  children,
  position = "popper",
  searchable = false,
  searchPlaceholder = "Search...",
  onCloseAutoFocus,
  ...props
}, ref) => {
  const dialogPortalContainer = React.useContext(DialogPortalContainerContext)
  const [search, setSearch] = React.useState("")
  const [showEmpty, setShowEmpty] = React.useState(false)
  const viewportRef = React.useRef<HTMLDivElement>(null)

  const setSearchInputRef = React.useCallback((node: HTMLInputElement | null) => {
    if (node) {
      requestAnimationFrame(() => node.focus())
    }
  }, [])

  React.useLayoutEffect(() => {
    if (!searchable) {
      setShowEmpty(false)
      return
    }
    const viewport = viewportRef.current
    if (!viewport) {
      setShowEmpty(false)
      return
    }
    if (!search.trim()) {
      setShowEmpty(false)
      return
    }
    const visibleItems = viewport.querySelectorAll('[role="option"]:not(.hidden)')
    setShowEmpty(visibleItems.length === 0)
  }, [search, searchable, children])

  return (
    <SelectSearchContext.Provider value={{ search, searchable }}>
      <SelectPrimitive.Portal container={dialogPortalContainer ?? undefined}>
        <SelectPrimitive.Content
          ref={ref}
          className={cn(
            "relative z-50 max-h-[--radix-select-content-available-height] min-w-[8rem] overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-select-content-transform-origin]",
            searchable ? "overflow-hidden flex flex-col" : "overflow-y-auto",
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className
          )}
          position={position}
          onCloseAutoFocus={(event) => {
            setSearch("")
            setShowEmpty(false)
            onCloseAutoFocus?.(event)
          }}
          {...props}
        >
          {searchable ? (
            <div className="flex items-center border-b px-3 sticky top-0 bg-popover z-10">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={setSearchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder={searchPlaceholder}
                className="flex h-10 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={searchPlaceholder}
              />
            </div>
          ) : null}
          <SelectScrollUpButton />
          <SelectPrimitive.Viewport
            ref={viewportRef}
            className={cn(
              "custom-scrollbar overscroll-contain touch-pan-y p-1",
              searchable && "overflow-y-auto max-h-[min(20rem,var(--radix-select-content-available-height))]",
              position === "popper" &&
                "w-full min-w-[var(--radix-select-trigger-width)]",
              position === "popper" && !searchable &&
                "h-[var(--radix-select-trigger-height)]"
            )}
          >
            {children}
            {showEmpty ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results
              </div>
            ) : null}
          </SelectPrimitive.Viewport>
          <SelectScrollDownButton />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectSearchContext.Provider>
  )
})
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm ", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, textValue, ...props }, ref) => {
  const { search, searchable } = React.useContext(SelectSearchContext)
  const label = textValue ?? getNodeText(children)
  const matches =
    !searchable ||
    !search.trim() ||
    label.toLowerCase().includes(search.trim().toLowerCase())

  return (
    <SelectPrimitive.Item
      ref={ref}
      textValue={textValue ?? label}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        !matches && "hidden",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>

      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
})
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
