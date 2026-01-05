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

type ColumnSizingCache = Record<string, number>;

const sizingCacheKey = (tableKey: string) => `table-sizing:${tableKey}`;

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
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [autoSizing, setAutoSizing] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);

  const columnIds = useMemo(
    () => columns.map((col) => col.id).filter(Boolean) as string[],
    [columns]
  );

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      const cachedSizing = window.localStorage.getItem(sizingCacheKey(tableKey));
      if (cachedSizing) {
        try {
          setColumnSizing(JSON.parse(cachedSizing) as ColumnSizingCache);
        } catch {
          window.localStorage.removeItem(sizingCacheKey(tableKey));
        }
      }
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
      window.localStorage.setItem(sizingCacheKey(tableKey), JSON.stringify(columnSizing));
    }, 500);
  }, [columnOrder, columnVisibility, columnSizing, tableKey]);

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
    defaultColumn: {
      minSize: 80,
    },
    state: {
      columnSizing,
      columnVisibility,
      columnOrder,
    },
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    if (Object.keys(columnSizing).length > 0) {
      setAutoSizing(false);
      return;
    }
    if (!tableRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const tableEl = tableRef.current;
      if (!tableEl) return;
      const nextSizing: Record<string, number> = {};
      table.getVisibleLeafColumns().forEach((col) => {
        const cells = tableEl.querySelectorAll(`[data-column-id="${col.id}"]`);
        let maxWidth = 0;
        cells.forEach((cell) => {
          const el = cell as HTMLElement;
          maxWidth = Math.max(maxWidth, el.scrollWidth);
        });
        if (maxWidth > 0) nextSizing[col.id] = maxWidth;
      });
      if (Object.keys(nextSizing).length > 0) {
        setColumnSizing(nextSizing);
      }
      setAutoSizing(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [columnSizing, data, table, columns]);

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
      <table ref={tableRef} style={{ tableLayout: autoSizing ? "auto" : "fixed" }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  data-column-id={header.column.id}
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getCanResize() ? (
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`table-resizer ${
                        header.column.getIsResizing() ? "is-resizing" : ""
                      }`}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  data-column-id={cell.column.id}
                  style={{ width: cell.column.getSize() }}
                >
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
