import React, { useState } from "react";
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState, type VisibilityState, type PaginationState, type OnChangeFn } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, SlidersHorizontal, Download, Search, Rows3 } from "lucide-react";
import { Button } from "../common/Button";
import { Skeleton } from "../ui/skeleton";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "../ui/dropdown-menu";
interface Props<T> {
  data: T[]; columns: ColumnDef<T>[]; label: string; loading?: boolean; error?: string; onRetry?: () => void;
  server?: { total: number; pagination: PaginationState; onChange: OnChangeFn<PaginationState> };
  pageSize?: number; searchable?: boolean; onExportSelected?: (rows: T[]) => void; getRowId: (row: T) => string;
}
/** Server-paged datasets never sort just the visible page. Reports sort the full loaded result. */
export function DataTable<T>({ data, columns, label, loading, error, onRetry, server, pageSize = 15, searchable, onExportSelected, getRowId }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [selection, setSelection] = useState({});
  const [query, setQuery] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });
  const table = useReactTable({
    data, columns, getRowId, state: { sorting, columnVisibility: visibility, globalFilter: query, rowSelection: selection, pagination: server?.pagination || pagination },
    onSortingChange: setSorting, onColumnVisibilityChange: setVisibility, onGlobalFilterChange: setQuery, onRowSelectionChange: setSelection,
    onPaginationChange: server?.onChange || setPagination,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: server ? undefined : getSortedRowModel(), getPaginationRowModel: server ? undefined : getPaginationRowModel(),
    manualPagination: Boolean(server), manualSorting: Boolean(server), rowCount: server?.total,
    enableSorting: !server, enableRowSelection: Boolean(onExportSelected), enableColumnResizing: true, columnResizeMode: "onChange",
  });
  const selected = table.getFilteredSelectedRowModel().rows;
  const count = server?.total ?? table.getFilteredRowModel().rows.length;
  const page = table.getState().pagination.pageIndex;
  const size = table.getState().pagination.pageSize;
  return <section className="sp-table" aria-label={label} aria-busy={loading || undefined}>
    <div className="sp-table-toolbar">
      {searchable ? <label className="sp-register-search"><Search size={16} /><input type="search" aria-label={`Search ${label}`} placeholder="Search register…" value={query} onChange={e => { setQuery(e.target.value); table.setPageIndex(0); }} /></label> : <span>{count.toLocaleString()} records · Newest first</span>}
      <div className="sp-table-actions">
        {selected.length > 0 && onExportSelected && <Button variant="outline" size="sm" onClick={() => onExportSelected(selected.map(r => r.original))}><Download size={15} />Export {selected.length} selected</Button>}
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><SlidersHorizontal size={15} />Columns</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Visible columns</DropdownMenuLabel><DropdownMenuSeparator />{table.getAllLeafColumns().filter(c => c.getCanHide()).map(c => <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={v => c.toggleVisibility(v)} onSelect={e => e.preventDefault()}>{typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>
      </div>
    </div>
    <div className="sp-table-scroll" tabIndex={0} role="region" aria-label={`${label} scroll area`}>
      <table className="sp-data-table" style={{ minWidth: table.getTotalSize() }}>
        <caption className="sr-only">{label}</caption>
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>
          {onExportSelected && <th scope="col"><input type="checkbox" aria-label="Select all matching records" checked={table.getIsAllRowsSelected()} ref={el => { if (el) el.indeterminate = table.getIsSomeRowsSelected(); }} onChange={table.getToggleAllRowsSelectedHandler()} /></th>}
          {group.headers.map(header => <th key={header.id} scope="col" style={{ width: header.getSize(), position: "relative" }} aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : undefined}>
            {header.column.getCanSort() ? <button type="button" className="sp-table-sort" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" ? <ArrowUp /> : header.column.getIsSorted() === "desc" ? <ArrowDown /> : <ArrowUpDown />}</button> : flexRender(header.column.columnDef.header, header.getContext())}
            {header.column.getCanResize() && <span className="sp-column-resizer" role="separator" aria-orientation="vertical" aria-valuenow={header.getSize()} aria-valuemin={70} aria-label={`Resize ${header.column.id} column`} tabIndex={0} onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} onDoubleClick={() => header.column.resetSize()} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); table.setColumnSizing(old => ({ ...old, [header.column.id]: Math.max(70, header.getSize() + (e.key === "ArrowRight" ? 20 : -20)) })); } }} />}
          </th>)}
        </tr>)}</thead>
        <tbody>{loading ? Array.from({ length: 5 }, (_, i) => <tr key={i}>{Array.from({ length: table.getVisibleLeafColumns().length + (onExportSelected ? 1 : 0) }, (_, j) => <td key={j}><Skeleton className="h-5 w-full" /></td>)}</tr>) : !error && table.getRowModel().rows.map(row => <tr key={row.id} data-selected={row.getIsSelected()}>
          {onExportSelected && <td><input type="checkbox" aria-label={`Select record ${row.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /></td>}
          {row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {!loading && (error || count === 0) && <div className="empty-state" role={error ? "alert" : "status"}><Rows3 size={26} aria-hidden="true" /><strong>{error ? "Records unavailable" : "No matching records"}</strong><p>{error || "Try a different search or date range."}</p>{error && onRetry && <Button variant="outline" onClick={onRetry}>Retry</Button>}</div>}
    <nav className="table-footer" aria-label={`${label} pagination`}><span>{count ? `Showing ${page * size + 1}–${Math.min((page + 1) * size, count)} of ${count.toLocaleString()} records` : "0 records"}</span><div><button type="button" aria-label="Previous transaction page" disabled={!table.getCanPreviousPage() || loading} onClick={() => table.previousPage()}><ChevronLeft size={16} /></button><span aria-live="polite">Page {page + 1} of {Math.max(1, table.getPageCount())}</span><button type="button" aria-label="Next transaction page" disabled={!table.getCanNextPage() || loading} onClick={() => table.nextPage()}><ChevronRight size={16} /></button></div></nav>
  </section>;
}
