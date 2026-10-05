"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { DialogPortalContainerContext } from "@/components/ui/dialog-portal-context"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogLayoutContext = React.createContext<"embedded" | "partitioned">("embedded")

export const dialogCloseButtonClassName =
  "absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-destructive/90 text-destructive-foreground shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors hover:bg-destructive focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none [&_svg]:h-3.5 [&_svg]:w-3.5 sm:right-0 sm:top-0 sm:translate-x-1/4 sm:-translate-y-1/4"

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 z-[50] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** When true, clicking outside the dialog will close it. Default false. */
  closeOnOutsideClick?: boolean;
  /** When true, the content wrapper does not scroll (no outer scrollbar). Use when only an inner area should scroll. */
  contentNoScroll?: boolean;
  /** Optional layout classes for this dialog's body wrapper. */
  bodyClassName?: string;
  /** When false, the built-in top-right close button is hidden. Default true. */
  showCloseButton?: boolean;
  closeButtonLabel?: string;
  closeButtonDisabled?: boolean;
  /** When true, omit the backdrop so an underlying canvas remains visible and interactive. */
  hideOverlay?: boolean;
  /** Optional classes for this dialog's portal backdrop, including nested-dialog z-index overrides. */
  overlayClassName?: string;
}

function flattenDialogChildren(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      return flattenDialogChildren(child.props.children)
    }

    return [child]
  })
}

function isDialogSection(
  child: React.ReactNode,
  section: typeof DialogHeader | typeof DialogFooter
) {
  return React.isValidElement(child) && child.type === section
}

function isDialogFooterSection(child: React.ReactNode) {
  if (isDialogSection(child, DialogFooter)) {
    return true
  }

  if (!React.isValidElement<{ children?: React.ReactNode }>(child) || child.type !== "div") {
    return false
  }

  const nestedChildren = flattenDialogChildren(child.props.children)
  return nestedChildren.length > 0 && nestedChildren.every((nestedChild) => isDialogSection(nestedChild, DialogFooter))
}

function prepareDialogFooterSection(child: React.ReactNode) {
  if (isDialogSection(child, DialogFooter) || !React.isValidElement<React.HTMLAttributes<HTMLDivElement>>(child)) {
    return child
  }

  return React.cloneElement(child, {
    className: cn("shrink-0", child.props.className),
  })
}

function partitionDialogForm(child: React.ReactNode, bodyClassName?: string): React.ReactNode | null {
  if (!React.isValidElement<React.HTMLAttributes<HTMLFormElement>>(child) || child.type !== "form") {
    return null
  }

  const formChildren = flattenDialogChildren(child.props.children)
  const footers = formChildren.filter(isDialogFooterSection).map(prepareDialogFooterSection)

  if (footers.length === 0) {
    return null
  }

  const body = formChildren.filter((formChild) => !isDialogFooterSection(formChild))

  return React.cloneElement(
    child,
    {
      className: cn(
        child.props.className,
        "flex min-h-0 flex-1 flex-col overflow-hidden space-y-0 pt-0"
      ),
    },
    <div
      data-slot="dialog-body"
      className={cn(
        "company-sidebar-scrollbar mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-2 pt-4",
        child.props.className,
        bodyClassName
      )}
    >
      {body}
    </div>,
    footers
  )
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, closeOnOutsideClick = false, contentNoScroll = false, bodyClassName, showCloseButton = true, closeButtonLabel = 'Close', closeButtonDisabled = false, hideOverlay = false, overlayClassName, onInteractOutside, onPointerDownOutside, ...props }, ref) => {
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null)
  const contentRef = React.useCallback((node: HTMLDivElement | null) => {
    setPortalContainer(node)
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }, [ref])
  const childNodes = flattenDialogChildren(children)
  const hasHeader = !contentNoScroll && childNodes.some((child) => isDialogSection(child, DialogHeader))

  const dialogChildren = (() => {
    if (contentNoScroll) {
      return (
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden p-6 pb-2", bodyClassName)}>
          <DialogLayoutContext.Provider value="embedded">
            {children}
          </DialogLayoutContext.Provider>
        </div>
      )
    }

    if (!hasHeader) {
      return <div className={cn("company-sidebar-scrollbar mr-2 min-h-0 flex-1 overflow-y-auto p-6 pb-2", bodyClassName)}>{children}</div>
    }

    const headers = childNodes.filter((child) => isDialogSection(child, DialogHeader))
    const footers = childNodes.filter(isDialogFooterSection).map(prepareDialogFooterSection)
    const body = childNodes.filter(
      (child) => !isDialogSection(child, DialogHeader) && !isDialogFooterSection(child)
    )
    const partitionedForm = body.length === 1 ? partitionDialogForm(body[0], bodyClassName) : null

    return (
      <DialogLayoutContext.Provider value="partitioned">
        {headers}
        {partitionedForm ?? (
          <div data-slot="dialog-body" className={cn("company-sidebar-scrollbar mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-2 pt-4", bodyClassName)}>
            {body}
          </div>
        )}
        {footers}
      </DialogLayoutContext.Provider>
    )
  })()

  return (
    <DialogPortal>
      {!hideOverlay && <DialogOverlay className={overlayClassName} />}
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="dialog-content"
        className={cn(
          "fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg max-h-[90vh] translate-x-[-50%] translate-y-[-50%] border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className,
          "overflow-visible" // Ensure close button is never clipped when positioned outside bounds
        )}
        onInteractOutside={closeOnOutsideClick ? onInteractOutside : (e) => { e.preventDefault(); onInteractOutside?.(e); }}
        onPointerDownOutside={closeOnOutsideClick ? onPointerDownOutside : (e) => { e.preventDefault(); onPointerDownOutside?.(e); }}
        {...props}
      >
        <DialogPortalContainerContext.Provider value={portalContainer}>
          {dialogChildren}
          {showCloseButton && (
            <DialogPrimitive.Close data-slot="dialog-close" className={dialogCloseButtonClassName} disabled={closeButtonDisabled}>
              <X className="h-4 w-4" />
              <span className="sr-only">{closeButtonLabel}</span>
            </DialogPrimitive.Close>
          )}
        </DialogPortalContainerContext.Provider>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const layout = React.useContext(DialogLayoutContext)

  return (
    <div
      className={cn(
        "flex flex-col gap-2 pb-4 text-center sm:text-left",
        layout === "partitioned" && "shrink-0 border-b border-border bg-background px-6 pt-6",
        className
      )}
      {...props}
    />
  )
}
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "z-20 flex shrink-0 flex-col-reverse border-t bg-background/95 px-6 py-3 shadow-[0_-8px_20px_-16px_rgba(0,0,0,0.55)] backdrop-blur-sm sm:flex-row sm:justify-end sm:space-x-2 [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:px-3",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg  leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm leading-relaxed text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
