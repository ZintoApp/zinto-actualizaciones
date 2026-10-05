import * as React from "react"
import { Minimize2, Maximize2 } from "lucide-react"

import { cn } from "@/lib/utils"

type TextareaProps = React.ComponentProps<"textarea"> & {
  expandedMinHeightPx?: number
  showExpandButton?: boolean
}

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ className, onPointerDownCapture, onMouseDownCapture, expandedMinHeightPx = 420, showExpandButton = true, style, ...props }, ref) => {
  const [isExpanded, setIsExpanded] = React.useState(false)

  const stopNodeDragFromTextarea = (
    event: React.PointerEvent<HTMLTextAreaElement> | React.MouseEvent<HTMLTextAreaElement>
  ) => {
    event.stopPropagation()
  }

  return (
    <div className="relative w-full">
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        style={{
          ...style,
          minHeight: isExpanded ? `${expandedMinHeightPx}px` : style?.minHeight,
        }}
        onPointerDownCapture={(e) => {
          onPointerDownCapture?.(e)
          stopNodeDragFromTextarea(e)
        }}
        onMouseDownCapture={(e) => {
          onMouseDownCapture?.(e)
          stopNodeDragFromTextarea(e)
        }}
        {...props}
      />
      {showExpandButton && <button
        type="button"
        className="absolute bottom-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded border border-input bg-background text-muted-foreground hover:text-foreground"
        onClick={() => setIsExpanded((prev) => !prev)}
        onPointerDownCapture={(event) => event.stopPropagation()}
        onMouseDownCapture={(event) => event.stopPropagation()}
        aria-label={isExpanded ? "Collapse textarea" : "Expand textarea"}
        title={isExpanded ? "Collapse" : "Expand"}
      >
        {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>}
    </div>
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
