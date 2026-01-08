"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import {
  useGetFluidaSyncSettingsQuery,
  useGetFluidaSyncStatusQuery,
  useRunFluidaSyncMutation,
} from "@/modules/fluida-sync";
import {
  useLazyGetContractsQuery,
  useLazyGetDbDailySummaryQuery,
  type DailyItem,
  type Contract,
} from "@/services/api";
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
  if (raw === "bt" || raw === "ble" || raw === "bluetooth") return "Bluetooth";
  if (raw === "forzata") return "Forzata";
  if (raw === "manual") return "Manuale";
  if (raw === "remote" || raw === "app" || raw === "mobile") return "Remoto";
  return raw.toUpperCase();
}

function formatClockType(value?: string) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "manual") return "Manuale";
  if (raw === "remote") return "Remoto";
  if (raw === "clock") return "Clock";
  return raw.toUpperCase();
}

function getValidationLabel(clockType?: string, deviceType?: string) {
  const clock = String(clockType || "").trim().toLowerCase();
  const device = String(deviceType || "").trim().toLowerCase();
  if (clock === "manual") return "Manuale";
  if (clock === "remote" && !device) return "Forzata";
  return formatDeviceType(device);
}

function SatelliteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="device-icon" aria-hidden="true">
      <path
        d="M14.5 4.5c2.2-1.2 4.2-1.6 5-0.8.8.8.4 2.8-.8 5l-3 3-4.2-4.2 3-3Z"
        fill="currentColor"
      />
      <path
        d="M9.6 8.4 4.5 9.5l2 2-3.5 3.5 1.5 1.5L8 13l2 2 1.1-5.1-1.5-1.5Z"
        fill="currentColor"
      />
      <path
        d="M16 12.5 11.5 17l2 2 4.5-4.5"
        fill="currentColor"
      />
    </svg>
  );
}

function BluetoothIcon() {
  return (
    <svg viewBox="0 0 24 24" className="device-icon" aria-hidden="true">
      <path
        d="M12 3v7.2L8.6 6.8 7 8.4l4.1 4.1L7 16.6l1.6 1.6L12 14.8V22l5-5-3-3 3-3-5-5Zm2.2 4.6 1.4 1.4-1.4 1.4V7.6Zm0 6 1.4 1.4-1.4 1.4v-2.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function renderValidationBadge(clockType?: string, deviceType?: string) {
  const label = getValidationLabel(clockType, deviceType);
  if (!label) return null;
  const device = String(deviceType || "").trim().toLowerCase();
  const isManual = String(clockType || "").trim().toLowerCase() === "manual";
  return (
    <span className={`device-badge ${isManual ? "device-badge-manual" : ""}`}>
      {device === "gps" ? <SatelliteIcon /> : null}
      {device === "bt" || device === "ble" || device === "bluetooth" ? <BluetoothIcon /> : null}
      {isManual ? <ManualIcon /> : null}
      <span>{label}</span>
    </span>
  );
}

function ManualIcon() {
  return (
    <svg viewBox="0 0 24 24" className="device-icon device-icon-manual" aria-hidden="true">
      <path
        d="M12 2.5a9.5 9.5 0 1 0 9.5 9.5A9.5 9.5 0 0 0 12 2.5Zm0 3a6.5 6.5 0 1 1-6.5 6.5A6.5 6.5 0 0 1 12 5.5Zm0 2a1.1 1.1 0 0 0-1.1 1.1v3.2l-2.2 2.2a1.1 1.1 0 0 0 1.6 1.6l2.5-2.5a1.1 1.1 0 0 0 .3-.8V8.6A1.1 1.1 0 0 0 12 7.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function diffMinutes(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const minutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  return `${minutes} min`;
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
  const { mock, organizationId, organizationStatus, organizationError } = useShell();
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
  const [includeCalendar, setIncludeCalendar] = useState(true);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyPerPage, setDailyPerPage] = useState(25);
  const [dailyStatus, setDailyStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [dailyItems, setDailyItems] = useState<DailyItem[]>([]);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    fetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    dirtyDays: number;
  } | null>(null);
  const [syncError, setSyncError] = useState("");

  const [triggerDaily] = useLazyGetDbDailySummaryQuery();
  const [triggerContracts, contractsResult] = useLazyGetContractsQuery();
  const [runSync, runSyncState] = useRunFluidaSyncMutation();
  const {
    data: syncStatusData,
    isFetching: syncStatusLoading,
    refetch: refetchSyncStatus,
  } = useGetFluidaSyncStatusQuery({ organizationId, limit: 5 }, { skip: !organizationId });
  const { data: syncSettings } = useGetFluidaSyncSettingsQuery(
    { organizationId },
    { skip: !organizationId }
  );

  const dailyData = dailyItems;
  const contractsData = contractsResult.data ?? [];
  const lastLog = syncStatusData?.status?.lastLog ?? null;
  const lastErrors = (syncStatusData?.logs?.[0]?.errors as { plannedErrors?: unknown[] } | undefined)
    ?.plannedErrors;
  const lastStatus = lastLog?.status || (runSyncState.isLoading ? "running" : "idle");
  const lastDuration = lastLog ? diffMinutes(lastLog.startedAt, lastLog.finishedAt) : null;

  const dailyCsvUrl = useMemo(() => {
    const params = new URLSearchParams({
      date: dailyDate,
      include_calendar: includeCalendar ? "1" : "0",
      organizationId,
    });
    return `/api/sync_daily_summary?${params.toString()}`;
  }, [dailyDate, includeCalendar, organizationId]);

  const loadDaily = async () => {
    if (!organizationId) {
      setDailyStatus(
        organizationStatus === "error"
          ? organizationError || "Errore nel recupero organizationId."
          : "Recupero organizationId..."
      );
      return;
    }
    setDailyStatus("Caricamento riepilogo...");
    try {
      const data = await triggerDaily(
        {
          date: dailyDate,
          organizationId,
          include_calendar: includeCalendar,
        },
        true
      ).unwrap();
      const items = data.items ?? [];
      setDailyItems(items);
      setDailyPage(1);
      setDailyStatus(`Trovate ${items.length} righe`);
    } catch (err) {
      const message =
        typeof err === "object" && err && "data" in err
          ? String((err as { data?: { error?: string } }).data?.error || "")
          : "";
      setDailyStatus(message ? `Errore: ${message}` : "Errore durante la lettura del riepilogo");
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
    if (!organizationId) {
      setDailyItems([]);
      setDailyStatus(
        organizationStatus === "error"
          ? organizationError || "Errore nel recupero organizationId."
          : "Recupero organizationId..."
      );
      return;
    }
    loadDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyDate, organizationId]);

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
        <button onClick={loadDaily} disabled={!organizationId}>
          Aggiorna dal DB
        </button>
        <button
          className="ghost"
          disabled={!organizationId || runSyncState.isLoading}
          onClick={() => {
            setSyncModalOpen(true);
            setSyncError("");
            setSyncResult(null);
            runSync({ organizationId, windowDays: syncSettings?.windowDays ?? 14 })
              .unwrap()
              .then((res) => {
                setSyncStatus("Sync completata.");
                if (res.stats) setSyncResult(res.stats);
                refetchSyncStatus();
                return loadDaily();
              })
              .catch((err) => {
                const message =
                  typeof err === "object" && err && "data" in err
                    ? String((err as { data?: { error?: string } }).data?.error || "")
                    : "";
                setSyncError(message || "Sync fallita.");
                setSyncStatus(message ? `Sync fallita: ${message}` : "Sync fallita.");
                refetchSyncStatus();
              });
          }}
        >
          {runSyncState.isLoading ? "Sync Fluida..." : "Sync Fluida"}
        </button>
        <button
          className="ghost"
          disabled={!organizationId}
          onClick={() => {
            setSyncModalOpen(true);
            refetchSyncStatus();
          }}
        >
          Stato sync
        </button>
        <a className="ghost" href={dailyCsvUrl}>
          Scarica CSV
        </a>
      </div>
      {!organizationId ? (
        <p className="muted">
          {organizationStatus === "error"
            ? organizationError || "Errore nel recupero organizationId."
            : "Recupero organizationId in corso..."}
        </p>
      ) : null}
      {syncStatus ? <p className="muted">{syncStatus}</p> : null}
      {syncModalOpen ? (
        <div className="modal-overlay" onClick={() => setSyncModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Stato sincronizzazione</h3>
              <button className="ghost" onClick={() => setSyncModalOpen(false)}>
                Chiudi
              </button>
            </div>
            <div className="modal-body">
              {runSyncState.isLoading ? <p>Sync in corso...</p> : null}
              {syncError ? <p className="muted">{syncError}</p> : null}
              {syncResult ? (
                <div className="debug-box">
                  <div className="debug-title">Risultato sync</div>
                  <div>Fetch: {syncResult.fetched}</div>
                  <div>Inseriti: {syncResult.inserted}</div>
                  <div>Aggiornati: {syncResult.updated}</div>
                  <div>Saltati: {syncResult.skipped}</div>
                  <div>Giorni ricalcolati: {syncResult.dirtyDays}</div>
                </div>
              ) : null}
              <div className="debug-box">
                <div className="debug-title">Ultimo log</div>
                {syncStatusLoading ? (
                  <div>Caricamento...</div>
                ) : lastLog ? (
                  <>
                    <div className="inline">
                      Stato:
                      <span className={`status-pill status-${lastStatus}`}>
                        {lastStatus === "running"
                          ? "In corso"
                          : lastStatus === "success"
                          ? "Completata"
                          : lastStatus === "failed"
                          ? "Fallita"
                          : lastStatus}
                      </span>
                    </div>
                    <div>
                      Periodo: {lastLog.rangeFrom.slice(0, 10)} - {lastLog.rangeTo.slice(0, 10)}
                    </div>
                    <div>Avvio: {formatDateTime(lastLog.startedAt)}</div>
                    <div>Fine: {formatDateTime(lastLog.finishedAt)}</div>
                    <div>Durata: {lastDuration ?? "--"}</div>
                    <div>Fetch: {lastLog.recordsFetched}</div>
                    <div>Inseriti: {lastLog.recordsInserted}</div>
                    <div>Aggiornati: {lastLog.recordsUpdated}</div>
                    <div>Saltati: {lastLog.recordsSkipped}</div>
                    {lastErrors && lastErrors.length ? (
                      <div className="error-box">
                        Errori pianificazioni: {lastErrors.length}
                        <div className="muted">
                          {JSON.stringify(lastErrors.slice(0, 3))}
                          {lastErrors.length > 3 ? "..." : ""}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div>Nessun log disponibile.</div>
                )}
              </div>
              {syncStatusData?.logs?.length ? (
                <div className="debug-box">
                  <div className="debug-title">Log recenti</div>
                  <div className="log-list">
                    {syncStatusData.logs.slice(0, 5).map((log) => {
                      const status = log.status;
                      const duration = diffMinutes(log.startedAt, log.finishedAt);
                      const errors =
                        (log.errors as { plannedErrors?: unknown[] } | undefined)?.plannedErrors?.length ?? 0;
                      return (
                        <div key={log.id} className="log-row">
                          <div className="inline">
                            <span className={`status-pill status-${status}`}>{status}</span>
                            <span>
                              {log.rangeFrom.slice(0, 10)} - {log.rangeTo.slice(0, 10)}
                            </span>
                          </div>
                          <div className="muted">
                            {formatDateTime(log.startedAt)} → {formatDateTime(log.finishedAt)} ({duration ?? "--"})
                          </div>
                          <div className="muted">
                            F {log.recordsFetched} | I {log.recordsInserted} | U {log.recordsUpdated} | S{" "}
                            {log.recordsSkipped} | Err {errors}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <div className="debug-box">
        <div className="debug-title">Debug</div>
        <div className="debug-links">
          <a
            href={`/api/daily_summary?date=${dailyDate}&include_calendar=${includeCalendar ? "1" : "0"}&mock=${mock ? "1" : "0"}&format=json&debug=1`}
          >
            /api/daily_summary?debug=1
          </a>
          {organizationId ? (
            <a
              href={`/api/sync_daily_summary?date=${dailyDate}&organizationId=${encodeURIComponent(organizationId)}&format=json`}
            >
              /api/sync_daily_summary?format=json
            </a>
          ) : null}
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
                    const rawClockType = String(r.entryClockType || "");
                    const clockType = formatClockType(rawClockType);
                    const deviceType =
                      (r.entryStampingDeviceType as string) || (r.entryDeviceType as string) || "";
                    const validation = renderValidationBadge(rawClockType, deviceType);
                    return (
                      <div>
                        <div>{time}</div>
                        {loc ? <div className="muted">{loc}</div> : null}
                        {clockType || validation ? (
                          <div className="meta-row">
                            {clockType ? <span className="muted">Tipo: {clockType}</span> : null}
                            {validation ? <span>{validation}</span> : null}
                          </div>
                        ) : null}
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
                    const rawClockType = String(r.exitClockType || "");
                    const clockType = formatClockType(rawClockType);
                    const deviceType =
                      (r.exitStampingDeviceType as string) || (r.exitDeviceType as string) || "";
                    const validation = renderValidationBadge(rawClockType, deviceType);
                    return (
                      <div>
                        <div>{time}</div>
                        {loc ? <div className="muted">{loc}</div> : null}
                        {clockType || validation ? (
                          <div className="meta-row">
                            {clockType ? <span className="muted">Tipo: {clockType}</span> : null}
                            {validation ? <span>{validation}</span> : null}
                          </div>
                        ) : null}
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
