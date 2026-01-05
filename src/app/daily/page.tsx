"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { useLazyGetContractsQuery, useLazyGetDailySummaryQuery, type DailyItem, type Contract } from "@/services/api";
import { useShell } from "../app-shell";

function formatMinutes(mins?: number) {
  const total = Number.isFinite(mins) ? (mins as number) : 0;
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatDeviceType(value?: string) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "gps") return "GPS";
  if (raw === "manual") return "Manuale";
  return raw.toUpperCase();
}

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

export default function DailyPage() {
  const { mock } = useShell();
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
  const [includeCalendar, setIncludeCalendar] = useState(true);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyPerPage, setDailyPerPage] = useState(25);
  const [dailyStatus, setDailyStatus] = useState("");
  const [dailyCache, setDailyCache] = useState<DailyItem[]>([]);
  const [dailyCacheLoaded, setDailyCacheLoaded] = useState(false);
  const autoLoaded = useRef(false);

  const [triggerDaily, dailyResult] = useLazyGetDailySummaryQuery();
  const [triggerContracts, contractsResult] = useLazyGetContractsQuery();

  const dailyData = dailyCacheLoaded ? dailyCache : dailyResult.data?.items ?? [];
  const contractsData = contractsResult.data ?? [];

  const dailyCsvUrl = useMemo(() => {
    const params = new URLSearchParams({
      date: dailyDate,
      include_calendar: includeCalendar ? "1" : "0",
      mock: mock ? "1" : "0",
    });
    return `/api/daily_summary?${params.toString()}`;
  }, [dailyDate, includeCalendar, mock]);

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
      const items = data.items ?? [];
      setDailyCache(items);
      setDailyCacheLoaded(true);
      if (typeof window !== "undefined") {
        const payload = {
          date: dailyDate,
          includeCalendar,
          items,
        };
        window.localStorage.setItem("dailySummaryCache", JSON.stringify(payload));
      }
      setDailyPage(1);
      setDailyStatus(`Trovate ${items.length} righe`);
    } catch (err) {
      setDailyStatus("Errore durante la lettura del riepilogo");
    }
  };

  const loadContracts = async () => {
    try {
      await triggerContracts({ mock }, true).unwrap();
    } catch {
      // ignore contract errors for now
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("dailySummaryCache");
    if (!raw) {
      setDailyCacheLoaded(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as {
        date?: string;
        includeCalendar?: boolean;
        items?: DailyItem[];
      };
      if (parsed.date) setDailyDate(parsed.date);
      if (typeof parsed.includeCalendar === "boolean") setIncludeCalendar(parsed.includeCalendar);
      if (Array.isArray(parsed.items)) {
        setDailyCache(parsed.items);
        setDailyStatus(`Caricato da cache: ${parsed.items.length} righe`);
      }
    } catch {
      // ignore cache parsing errors
    } finally {
      setDailyCacheLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!dailyCacheLoaded) return;
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    loadDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyCacheLoaded]);

  useEffect(() => {
    loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock]);

  const contractNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contractsData as Contract[]) {
      const id = String(c.id || "");
      const name = `${c.first_name || ""} ${c.last_name || ""}`.trim();
      const fallback = String(c.email || "").trim();
      if (id) map.set(id, name || fallback);
    }
    return map;
  }, [contractsData]);

  const dailyRows = useMemo(() => {
    const normalizeTime = (value?: string) => {
      if (!value) return "";
      const raw = String(value);
      if (raw.includes("T") && raw.length >= 19) return raw.slice(11, 19);
      if (raw.includes(" ") && raw.length >= 8) return raw.split(" ").pop() || raw;
      return raw;
    };

    const rows = (dailyData as DailyItem[]).map((row) => {
      const contractId = String(row.contractId || "");
      const nameFromData = String(row.personName || "").trim();
      const nameFromContracts = contractId ? contractNameById.get(contractId) : "";
      const personDisplay = nameFromData || nameFromContracts || "Sconosciuto";
      const locationsDisplay =
        row.stampingLocations && row.stampingLocations.length > 0 ? row.stampingLocations.join(" | ") : "";

      return {
        ...row,
        personDisplay,
        entryTimeDisplay: normalizeTime(row.entryTime),
        exitTimeDisplay: normalizeTime(row.exitTime),
        locationsDisplay,
      };
    });

    rows.sort((a, b) => {
      const nameA = String(a.personDisplay || "").toLowerCase();
      const nameB = String(b.personDisplay || "").toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      const dayA = String(a.day || "");
      const dayB = String(b.day || "");
      if (dayA !== dayB) return dayA.localeCompare(dayB);
      const timeA = String(a.entryTimeDisplay || "");
      const timeB = String(b.entryTimeDisplay || "");
      return timeA.localeCompare(timeB);
    });

    return rows;
  }, [dailyData, contractNameById]);

  const paginatedDaily = useMemo(() => {
    const start = (dailyPage - 1) * dailyPerPage;
    return dailyRows.slice(start, start + dailyPerPage);
  }, [dailyRows, dailyPage, dailyPerPage]);

  return (
    <section className="panel">
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
          <input type="checkbox" checked={includeCalendar} onChange={(e) => setIncludeCalendar(e.target.checked)} />
          Includi sede pianificata
        </label>
        <button onClick={loadDaily}>Aggiorna riepilogo</button>
        <a className="ghost" href={dailyCsvUrl}>
          Scarica CSV
        </a>
      </div>
      <div className="debug-box">
        <div className="debug-title">Debug</div>
        <div className="debug-links">
          <a
            href={`/api/daily_summary?date=${dailyDate}&include_calendar=${includeCalendar ? "1" : "0"}&mock=${mock ? "1" : "0"}&format=json&debug=1`}
          >
            /api/daily_summary?debug=1
          </a>
          <a href="/api/contracts?debug=1">/api/contracts?debug=1</a>
        </div>
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
                  id: "personDisplay",
                  header: "Persona",
                  accessorKey: "personDisplay",
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
                    const time = r.entryTimeDisplay ? String(r.entryTimeDisplay) : "--";
                    const loc = r.entryLocation ? String(r.entryLocation) : "";
                    const device = formatDeviceType(r.entryDeviceType as string);
                    return (
                      <div>
                        <div>{time}</div>
                        {loc ? <div className="muted">{loc}</div> : null}
                        {device ? <div className="muted">Tipo: {device}</div> : null}
                      </div>
                    );
                  },
                },
                {
                  id: "exit",
                  header: "Uscita",
                  cell: ({ row }) => {
                    const r = row.original as Record<string, unknown>;
                    const time = r.exitTimeDisplay ? String(r.exitTimeDisplay) : "--";
                    const loc = r.exitLocation ? String(r.exitLocation) : "";
                    const device = formatDeviceType(r.exitDeviceType as string);
                    return (
                      <div>
                        <div>{time}</div>
                        {loc ? <div className="muted">{loc}</div> : null}
                        {device ? <div className="muted">Tipo: {device}</div> : null}
                      </div>
                    );
                  },
                },
                {
                  id: "stampingLocations",
                  header: "Sede timbratura",
                  accessorKey: "locationsDisplay",
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
  );
}
