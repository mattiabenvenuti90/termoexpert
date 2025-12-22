"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAssociateMutation,
  useGetSitesQuery,
  useLazyGetContractsQuery,
  useLazyGetDailySummaryQuery,
  useLazyGetExportsQuery,
} from "@/services/api";
import { DataTable } from "@/components/DataTable";
import { ColumnDef } from "@tanstack/react-table";

const endpointCards = [
  {
    id: "exports",
    title: "Timbrature (stampings)",
    method: "GET",
    path: "/api/exports",
    description: "Lista delle timbrature Fluida con supporto mock, range date e conteggio record.",
    params: ["mock", "count", "from_date", "to_date"],
  },
  {
    id: "export_csv",
    title: "Download CSV timbrature",
    method: "GET",
    path: "/api/export_csv",
    description: "Esporta le timbrature correnti in CSV con sede associata (manuale o auto-match).",
    params: ["mock", "count", "from_date", "to_date"],
  },
  {
    id: "daily_summary",
    title: "Riepilogo giornaliero",
    method: "GET",
    path: "/api/daily_summary",
    description: "Restituisce minuti lavorati, sedi di timbratura e sedi pianificate (JSON o CSV).",
    params: ["date", "include_calendar", "mock", "format=json"],
  },
  {
    id: "sites",
    title: "Sedi/Cantieri",
    method: "GET/POST",
    path: "/api/sites",
    description: "Gestione elenco sedi con parole chiave per auto-match delle timbrature.",
    params: ["name", "keywords"],
  },
];

function formatMinutes(mins?: number) {
  const total = Number.isFinite(mins) ? (mins as number) : 0;
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function HomePage() {
  const [mock, setMock] = useState(false);
  const [count, setCount] = useState(50);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exportsPage, setExportsPage] = useState(1);
  const [exportsPerPage, setExportsPerPage] = useState(25);
  const [status, setStatus] = useState("");

  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
  const [includeCalendar, setIncludeCalendar] = useState(true);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyPerPage, setDailyPerPage] = useState(25);
  const [dailyStatus, setDailyStatus] = useState("");

  const [contractsPage, setContractsPage] = useState(1);
  const [contractsPerPage, setContractsPerPage] = useState(25);
  const [contractsStatus, setContractsStatus] = useState("");

  const [page, setPage] = useState("home");

  const { data: sites = [] } = useGetSitesQuery();
  const [associate] = useAssociateMutation();
  const [triggerExports, exportsResult] = useLazyGetExportsQuery();
  const [triggerDaily, dailyResult] = useLazyGetDailySummaryQuery();
  const [triggerContracts, contractsResult] = useLazyGetContractsQuery();

  const exportsData = exportsResult.data ?? [];
  const dailyData = dailyResult.data?.items ?? [];
  const contractsData = contractsResult.data ?? [];

  const csvUrl = useMemo(() => {
    const params = new URLSearchParams({ mock: mock ? "1" : "0" });
    if (count) params.set("count", String(count));
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    return `/api/export_csv?${params.toString()}`;
  }, [mock, count, fromDate, toDate]);

  const dailyCsvUrl = useMemo(() => {
    const params = new URLSearchParams({
      date: dailyDate,
      include_calendar: includeCalendar ? "1" : "0",
      mock: mock ? "1" : "0",
    });
    return `/api/daily_summary?${params.toString()}`;
  }, [dailyDate, includeCalendar, mock]);

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

  const loadDaily = async () => {
    setDailyStatus("Caricamento riepilogo...");
    try {
      const data = await triggerDaily(
        {
          date: dailyDate,
          include_calendar: includeCalendar,
          mock,
        },
        true
      ).unwrap();
      setDailyPage(1);
      setDailyStatus(`Trovate ${data.items ? data.items.length : 0} righe`);
    } catch (err) {
      setDailyStatus("Errore durante la lettura del riepilogo");
    }
  };

  const loadContracts = async () => {
    setContractsStatus("Caricamento contratti...");
    try {
      const data = await triggerContracts({ mock }, true).unwrap();
      setContractsPage(1);
      setContractsStatus(`Trovati ${data.length} contratti`);
    } catch (err) {
      setContractsStatus("Errore durante la lettura dei contratti");
    }
  };

  useEffect(() => {
    loadExports();
    loadDaily();
    loadContracts();
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

  const paginatedDaily = useMemo(() => {
    const start = (dailyPage - 1) * dailyPerPage;
    return dailyData.slice(start, start + dailyPerPage);
  }, [dailyData, dailyPage, dailyPerPage]);

  const paginatedContracts = useMemo(() => {
    const start = (contractsPage - 1) * contractsPerPage;
    return contractsData.slice(start, start + contractsPerPage);
  }, [contractsData, contractsPage, contractsPerPage]);

  function renderPagination(total: number, currentPage: number, perPage: number, onPageChange: (p: number) => void) {
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

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">Fluida mini portale</div>
        <div className="nav-group">
          <button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}>
            Home / Panoramica
          </button>
          <button className={page === "exports" ? "active" : ""} onClick={() => setPage("exports")}>
            Timbrature
          </button>
          <button className={page === "daily" ? "active" : ""} onClick={() => setPage("daily")}>
            Riepilogo giornaliero
          </button>
          <button className={page === "contracts" ? "active" : ""} onClick={() => setPage("contracts")}>
            Contratti
          </button>
        </div>
        <div className="meta">
          <div>API base</div>
          <code>/api</code>
          <label className="inline">
            <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} /> Usa mock
          </label>
        </div>
      </nav>

      <main className="content">
        {page === "home" && (
          <>
            <header className="hero">
              <div>
                <p className="eyebrow">workspace fluida</p>
                <h1>Dashboard rapida per testare le API</h1>
                <p className="lede">
                  Home con riepilogo e link alle viste: timbrature raw e riepilogo giornaliero con sede effettiva e
                  pianificata.
                </p>
              </div>
              <div className="actions">
                <button className="ghost" onClick={() => setPage("exports")}>
                  Vai alle timbrature
                </button>
                <button className="primary" onClick={() => setPage("daily")}>
                  Vai al riepilogo
                </button>
              </div>
            </header>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Reference</p>
                  <h2>API che possiamo richiamare</h2>
                </div>
                <span className="hint">Tutte puntano al backend locale Next.js</span>
              </div>
              <div className="card-grid">
                {endpointCards.map((ep) => (
                  <div key={ep.id} className="card">
                    <div className="card-head">
                      <span className={`method method-${ep.method.split("/")[0].toLowerCase()}`}>{ep.method}</span>
                      <code className="path">{ep.path}</code>
                    </div>
                    <p className="card-desc">{ep.description}</p>
                    <div className="pill-row">
                      {ep.params.map((p) => (
                        <span key={p} className="pill">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Sintesi dati</p>
                  <h2>Statistiche veloci</h2>
                </div>
                <span className="hint">Ultimo fetch in pagina</span>
              </div>
              <div className="card-grid">
                <div className="card">
                  <p className="eyebrow">Timbrature</p>
                  <h3>{exportsData.length}</h3>
                  <p className="card-desc">Record caricati</p>
                  <button className="ghost" onClick={() => setPage("exports")}>
                    Vai alla tabella
                  </button>
                </div>
                <div className="card">
                  <p className="eyebrow">Riepilogo giornaliero</p>
                  <h3>{dailyData.length}</h3>
                  <p className="card-desc">Righe per data {dailyDate}</p>
                  <button className="ghost" onClick={() => setPage("daily")}>
                    Vai al riepilogo
                  </button>
                </div>
                <div className="card">
                  <p className="eyebrow">Contratti</p>
                  <h3>{contractsData.length}</h3>
                  <p className="card-desc">Persone rilevate</p>
                  <button className="ghost" onClick={() => setPage("contracts")}>
                    Vai ai contratti
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {page === "exports" && (
          <section id="timbrature" className="panel">
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
        )}

        {page === "daily" && (
          <section id="riepilogo" className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Ogni persona / ogni giorno</p>
                <h2>Riepilogo giornaliero con sedi</h2>
              </div>
              <span className="hint">{dailyStatus || "Pronto"}</span>
            </div>

            <div className="controls">
              <label>
                Per pagina
                <select value={dailyPerPage} onChange={(e) => setDailyPerPage(Number(e.target.value))}>
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data
                <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
              </label>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={includeCalendar}
                  onChange={(e) => setIncludeCalendar(e.target.checked)}
                />
                Includi sede pianificata
              </label>
              <button onClick={loadDaily}>Aggiorna riepilogo</button>
              <a className="ghost" href={dailyCsvUrl}>
                Scarica CSV
              </a>
            </div>

            {dailyData && dailyData.length > 0 ? (
              <div className="table-wrap">
                {renderPagination(dailyData.length, dailyPage, dailyPerPage, setDailyPage)}
                <DataTable
                  tableKey="daily_summary"
                  data={paginatedDaily}
                  columns={
                    [
                      {
                        id: "personName",
                        header: "Nome",
                        accessorKey: "personName",
                        cell: (info) => String(info.getValue() ?? "--"),
                      },
                      {
                        id: "contractId",
                        header: "Contratto",
                        accessorKey: "contractId",
                        cell: (info) => String(info.getValue() ?? "--"),
                      },
                      { id: "day", header: "Giorno", accessorKey: "day" },
                      { id: "workedMinutes", header: "Minuti", accessorKey: "workedMinutes" },
                      {
                        id: "workedHours",
                        header: "Ore (hh:mm)",
                        accessorFn: (row) => formatMinutes(row.workedMinutes),
                        cell: (info) => String(info.getValue() ?? "--"),
                      },
                      { id: "clockRecordsCount", header: "# timbrature", accessorKey: "clockRecordsCount" },
                      {
                        id: "entry",
                        header: "Entrata",
                        cell: ({ row }) => {
                          const r = row.original as Record<string, unknown>;
                          return (
                            <div>
                              <div>{String(r.entryLocation ?? "--")}</div>
                              {r.entryTime ? <div className="muted">{String(r.entryTime)}</div> : null}
                            </div>
                          );
                        },
                      },
                      {
                        id: "exit",
                        header: "Uscita",
                        cell: ({ row }) => {
                          const r = row.original as Record<string, unknown>;
                          return (
                            <div>
                              <div>{String(r.exitLocation ?? "--")}</div>
                              {r.exitTime ? <div className="muted">{String(r.exitTime)}</div> : null}
                            </div>
                          );
                        },
                      },
                      {
                        id: "stampingLocations",
                        header: "Sede timbratura",
                        accessorFn: (row) =>
                          row.stampingLocations && row.stampingLocations.length > 0
                            ? row.stampingLocations.join(" | ")
                            : "--",
                        cell: (info) => String(info.getValue() ?? "--"),
                      },
                      { id: "plannedShift", header: "Turno pianificato", accessorKey: "plannedShift" },
                      { id: "plannedLocation", header: "Sede pianificata", accessorKey: "plannedLocation" },
                    ] as ColumnDef<Record<string, unknown>, unknown>[]
                  }
                />
                {renderPagination(dailyData.length, dailyPage, dailyPerPage, setDailyPage)}
              </div>
            ) : (
              <p className="muted">Nessun dato per la data selezionata</p>
            )}
          </section>
        )}

        {page === "contracts" && (
          <section id="contratti" className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Anagrafica</p>
                <h2>Contratti / persone</h2>
              </div>
              <span className="hint">{contractsStatus || "Pronto"}</span>
            </div>
            <div className="controls">
              <label>
                Per pagina
                <select value={contractsPerPage} onChange={(e) => setContractsPerPage(Number(e.target.value))}>
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={loadContracts}>Ricarica</button>
            </div>
            {contractsData && contractsData.length > 0 ? (
              <div className="table-wrap">
                {renderPagination(contractsData.length, contractsPage, contractsPerPage, setContractsPage)}
                <DataTable
                  tableKey="contracts"
                  data={paginatedContracts}
                  columns={
                    [
                      { id: "id", header: "ID", accessorKey: "id" },
                      {
                        id: "name",
                        header: "Nome",
                        accessorFn: (row) => `${row.first_name || ""} ${row.last_name || ""}`.trim() || "--",
                        cell: (info) => String(info.getValue() ?? "--"),
                      },
                      { id: "email", header: "Email", accessorKey: "email" },
                    ] as ColumnDef<Record<string, unknown>, unknown>[]
                  }
                />
                {renderPagination(contractsData.length, contractsPage, contractsPerPage, setContractsPage)}
              </div>
            ) : (
              <p className="muted">Nessun contratto trovato</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
