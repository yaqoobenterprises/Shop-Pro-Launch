import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataTable } from "../src/components/tables/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
const rows = Array.from({ length: 17 }, (_, i) => ({ id: `row-${i}`, description: `Entry ${i}`, amount: i * 100 }));
const columns: ColumnDef<typeof rows[number]>[] = [{ accessorKey: "description", header: "Description" }, { accessorKey: "amount", header: "Amount" }];
describe("financial register table boundaries", () => {
  it("sorts the entire loaded result before pagination and exports selected matching rows", () => {
    const exportRows = vi.fn();
    render(<DataTable data={rows} columns={columns} label="Register" getRowId={r => r.id} searchable onExportSelected={exportRows} />);
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    const table = screen.getByRole("table");
    expect(table.querySelector("tbody tr")?.textContent).toBe("Entry 161600");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Register" }), { target: { value: "Entry 16" } });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all matching records" }));
    fireEvent.click(screen.getByRole("button", { name: "Export 1 selected" }));
    expect(exportRows).toHaveBeenCalledWith([rows[16]]);
  });
  it("keeps server pagination and ordering under the service's control", () => {
    const change = vi.fn();
    render(<DataTable data={rows.slice(0, 2)} columns={columns} label="Entries" getRowId={r => r.id} server={{ total: 50, pagination: { pageIndex: 0, pageSize: 25 }, onChange: change }} />);
    expect(within(screen.getByRole("table")).queryByRole("button", { name: "Amount" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next transaction page" }));
    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0][0]({ pageIndex: 0, pageSize: 25 })).toEqual({ pageIndex: 1, pageSize: 25 });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
