import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { useTranslation } from "@/hooks/use-translation"
import {
  compareErpSortValues,
  type ErpTableSortDirection,
  type ErpTableSortType,
} from "@shared/utils/erp-table-sorting"

export type TableSortState = { columnIndex: number; direction: ErpTableSortDirection; type: ErpTableSortType }

const TableSortContext = React.createContext<{
  enabled: boolean
  manualSorting?: boolean
  sort: TableSortState | null
  setSort: React.Dispatch<React.SetStateAction<TableSortState | null>>
}>({ enabled: false, sort: null, setSort: () => undefined })

function nodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join(" ")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children)
  return ""
}

function containsInteractiveNode(node: React.ReactNode): boolean {
  if (Array.isArray(node)) return node.some(containsInteractiveNode)
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return false
  if (typeof node.type === "string" && ["button", "input", "select", "textarea", "a"].includes(node.type)) return true
  const displayName = typeof node.type === "function"
    ? (node.type as { displayName?: string; name?: string }).displayName || (node.type as { name?: string }).name
    : ""
  if (displayName && /Button|Checkbox|Select|Input|Dropdown|Menu|Popover/.test(displayName)) return true
  return containsInteractiveNode(node.props.children)
}

function flattenRows(node: React.ReactNode): React.ReactElement<{ children?: React.ReactNode }>[] {
  const rows: React.ReactElement<{ children?: React.ReactNode }>[] = []
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return
    if (child.type === React.Fragment) rows.push(...flattenRows(child.props.children))
    else rows.push(child)
  })
  return rows
}

function rowSortValue(row: React.ReactElement<{ children?: React.ReactNode }>, columnIndex: number): unknown {
  const cells = React.Children.toArray(row.props.children)
  const cell = cells[columnIndex]
  if (!React.isValidElement<{ children?: React.ReactNode; "data-sort-value"?: unknown }>(cell)) return null
  return cell.props["data-sort-value"] ?? nodeText(cell.props.children).trim()
}

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  erpSortable?: boolean
  sort?: TableSortState | null
  onSortChange?: React.Dispatch<React.SetStateAction<TableSortState | null>>
  manualSorting?: boolean
}

const Table = React.forwardRef<
  HTMLTableElement,
  TableProps
>(({ className, erpSortable, sort: controlledSort, onSortChange, manualSorting = false, ...props }, ref) => {
  const isErpRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/erp")
  const enabled = erpSortable ?? isErpRoute
  const [localSort, setLocalSort] = React.useState<TableSortState | null>(null)
  const sort = controlledSort === undefined ? localSort : controlledSort
  const setSort = onSortChange ?? setLocalSort
  return (
    <TableSortContext.Provider value={{ enabled, sort, setSort, manualSorting }}>
      <div data-slot="table-container" className="relative w-full overflow-auto">
        <table
          ref={ref}
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </TableSortContext.Provider>
  )
})
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} data-slot="table-head" className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, children, ...props }, ref) => {
  const { enabled, sort, manualSorting } = React.useContext(TableSortContext)
  const renderedChildren = React.useMemo(() => {
    if (!enabled || !sort || manualSorting) return children
    return flattenRows(children)
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const comparison = compareErpSortValues(
          rowSortValue(left.row, sort.columnIndex),
          rowSortValue(right.row, sort.columnIndex),
          sort.direction,
          sort.type,
        )
        return comparison || left.index - right.index
      })
      .map(({ row }) => row)
  }, [children, enabled, sort, manualSorting])
  return (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    >
      {renderedChildren}
    </tbody>
  )
})
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    data-slot="table-row"
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & {
    sortable?: boolean
    sortType?: ErpTableSortType
  }
>(({ className, children, sortable, sortType = "auto", ...props }, ref) => {
  const { t } = useTranslation()
  const { enabled, sort, setSort } = React.useContext(TableSortContext)
  const [ownColumnIndex, setOwnColumnIndex] = React.useState<number | null>(null)
  const label = nodeText(children).trim()
  const actionLabels = [
    t("erp.common.action", "Action"),
    t("erp.common.actions", "Actions"),
  ].map((value) => value.toLocaleLowerCase())
  const excludedLabel = actionLabels.includes(label.toLocaleLowerCase()) || /^(actions?|acciones?)$/i.test(label)
  const isSortable = enabled && sortable !== false && Boolean(label) && !excludedLabel && !containsInteractiveNode(children)
  const handleSort = (event: React.MouseEvent<HTMLButtonElement>) => {
    const columnIndex = event.currentTarget.closest("th")?.cellIndex
    if (columnIndex == null || columnIndex < 0) return
    setOwnColumnIndex(columnIndex)
    setSort((current) => current?.columnIndex === columnIndex
      ? { ...current, direction: current.direction === "asc" ? "desc" : "asc", type: sortType }
      : { columnIndex, direction: "asc", type: sortType })
  }
  const actualActive = isSortable && sort != null && sort.columnIndex === ownColumnIndex
  const SortIcon = !actualActive ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      aria-sort={actualActive ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined}
      {...props}
    >
      {isSortable ? (
        <button
          type="button"
          className={cn(
            "inline-flex h-9 w-full items-center gap-1.5 rounded-md px-1 text-left font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className?.includes("text-right") && "justify-end text-right",
          )}
          onClick={handleSort}
          title={actualActive && sort.direction === "asc"
            ? t("erp.common.sortDescending", "Sort descending")
            : t("erp.common.sortAscending", "Sort ascending")}
        >
          {children}
          <SortIcon className="h-3.5 w-3.5 shrink-0" />
        </button>
      ) : children}
    </th>
  )
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
