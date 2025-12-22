"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";

type TableSettings = {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
};

type DataTableProps<T> = {
  tableKey: string;
  data: T[];
  columns: ColumnDef<T, unknown>[];
};

function getAccessToken() {
  if (typeof window === "undefined") return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname;
    const projectRef = host.split(".")[0];
    const key = `sb-${projectRef}-auth-token`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string };
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

export function DataTable<T>({ tableKey, data, columns }: DataTableProps<T>) {
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const columnIds = useMemo(
    () => columns.map((col) => col.id).filter(Boolean) as string[],
    [columns]
  );

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/table_settings/${tableKey}`, { headers });
      if (!res.ok) return;
      const json = (await res.json()) as TableSettings;
      if (ignore) return;
      setColumnVisibility(json.columnVisibility || {});
      setColumnOrder(json.columnOrder || []);
    };
    load();
    return () => {
      ignore = true;
    };
  }, [tableKey]);

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const token = getAccessToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      await fetch(`/api/table_settings/${tableKey}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ columnOrder, columnVisibility }),
      });
    }, 500);
  }, [columnOrder, columnVisibility, tableKey]);

  const orderedColumns = useMemo(() => {
    if (columnOrder.length === 0) return columns;
    const orderSet = new Set(columnOrder);
    const ordered = columnOrder
      .map((id) => columns.find((col) => col.id === id))
      .filter(Boolean) as ColumnDef<T, unknown>[];
    const remaining = columns.filter((col) => !orderSet.has(col.id as string));
    return [...ordered, ...remaining];
  }, [columnOrder, columns]);

  const table = useReactTable({
    data,
    columns: orderedColumns,
    state: {
      columnVisibility,
      columnOrder,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
  });

  const visibleColumns = table.getAllLeafColumns();

  const moveColumn = (id: string, dir: "up" | "down") => {
    setColumnOrder((prev) => {
      const base = prev.length ? [...prev] : columnIds;
      const idx = base.indexOf(id);
      if (idx === -1) return base;
      const nextIdx = dir === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= base.length) return base;
      const copy = [...base];
      const [removed] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, removed);
      return copy;
    });
  };

  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <button className="ghost" onClick={() => setMenuOpen((v) => !v)}>
          Colonne
        </button>
        {menuOpen ? (
          <div className="table-menu">
            {visibleColumns.map((col) => (
              <div key={col.id} className="table-menu-row">
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={() => col.toggleVisibility()}
                  />
                  {String(col.columnDef.header)}
                </label>
                <div className="table-menu-actions">
                  <button onClick={() => moveColumn(col.id, "up")}>Up</button>
                  <button onClick={() => moveColumn(col.id, "down")}>Down</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
