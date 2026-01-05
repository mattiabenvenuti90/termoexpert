"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { useAssociateMutation, useGetSitesQuery, useLazyGetExportsQuery } from "@/services/api";
import { useShell } from "../app-shell";

function renderPagination(
  total: number,
  currentPage: number,
  perPage: number,
  onPageChange: (p: number) => void
) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  return (
    <div className="pagination">
      <button disabled={!canPrev} onClick={() => onPageChange(currentPage - 1)} aria-label="Pagina precedente">
        &lt;
      </button>
      <span>
        Pagina {currentPage} / {totalPages}
      </span>
      <button disabled={!canNext} onClick={() => onPageChange(currentPage + 1)} aria-label="Pagina successiva">
        &gt;
      </button>
    </div>
  );
}

export default function ExportsPage() {
  const { mock } = useShell();
  const [count, setCount] = useState(50);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exportsPage, setExportsPage] = useState(1);
  const [exportsPerPage, setExportsPerPage] = useState(25);
  const [status, setStatus] = useState("");

  const { data: sites = [] } = useGetSitesQuery();
  const [associate] = useAssociateMutation();
  const [triggerExports, exportsResult] = useLazyGetExportsQuery();

  const exportsData = exportsResult.data ?? [];

  const csvUrl = useMemo(() => {
    const params = new URLSearchParams({ mock: mock ? "1" : "0" });
    if (count) params.set("count", String(count));
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    return `/api/export_csv?${params.toString()}`;
  }, [mock, count, fromDate, toDate]);

  const loadExports = async () => {
    setStatus("Caricamento timbrature...");
    try {
      const data = await triggerExports(
        {
          mock,
          count,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        },
        true
      ).unwrap();
      setExportsPage(1);
      setStatus(`Caricati ${data.length} record`);
    } catch (err) {
      setStatus("Errore durante la lettura delle timbrature");
    }
  };

  useEffect(() => {
    loadExports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock]);

  const handleAssociate = async (recordId: string, siteId: string) => {
    try {
      await associate({ recordId, siteId: siteId || null }).unwrap();
      await loadExports();
    } catch (err) {
      setStatus("Errore durante l'associazione");
    }
  };

  const exportColumns =
    exportsData && exportsData.length > 0
      ? Object.keys(exportsData[0]).filter((k) => k !== "siteId")
      : [];

  const paginatedExports = useMemo(() => {
    const start = (exportsPage - 1) * exportsPerPage;
    return exportsData.slice(start, start + exportsPerPage);
  }, [exportsData, exportsPage, exportsPerPage]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Dataset grezzo</p>
          <h2>Timbrature</h2>
        </div>
        <span className="hint">{status || "Pronto"}</span>
      </div>

      <div className="controls">
        <label>
          Count
          <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label>
          Per pagina
          <select value={exportsPerPage} onChange={(e) => setExportsPerPage(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dal
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          Al
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button onClick={loadExports} disabled={exportsResult.isFetching}>
          Carica
        </button>
        <a className="ghost" href={csvUrl}>
          Scarica CSV
        </a>
      </div>

      {exportsData && exportsData.length > 0 ? (
        <div className="table-wrap">
          {renderPagination(exportsData.length, exportsPage, exportsPerPage, setExportsPage)}
          <DataTable
            tableKey="exports"
            data={paginatedExports}
            columns={
              [
                ...exportColumns.map(
                  (key) =>
                    ({
                      id: key,
                      header: key,
                      accessorFn: (row: Record<string, unknown>) => row[key],
                      cell: (info) => String(info.getValue() ?? ""),
                    }) as ColumnDef<Record<string, unknown>, unknown>
                ),
                {
                  id: "siteName",
                  header: "Cantiere associato",
                  cell: ({ row }) => {
                    const record = row.original as Record<string, unknown>;
                    return (
                      <div>
                        <select
                          value={String(record.siteId ?? "")}
                          onChange={(e) => handleAssociate(String(record.id), e.target.value)}
                        >
                          <option value="">-- nessuno --</option>
                          {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        {record.siteName ? (
                          <div className="muted">Assegnato: {String(record.siteName)}</div>
                        ) : null}
                      </div>
                    );
                  },
                } as ColumnDef<Record<string, unknown>, unknown>,
              ] as ColumnDef<Record<string, unknown>, unknown>[]
            }
          />
          {renderPagination(exportsData.length, exportsPage, exportsPerPage, setExportsPage)}
        </div>
      ) : (
        <p className="muted">Nessun record</p>
      )}
    </section>
  );
}
