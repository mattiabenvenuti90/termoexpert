"use client";

import { useMemo, useState } from "react";
import { useGetFluidaSyncStatusQuery, useRunFluidaSyncMutation } from "../rtk/fluidaSyncApi";

type SyncDashboardProps = {
  organizationId?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function diffMinutes(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const minutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  return `${minutes} min`;
}

export function SyncDashboard({ organizationId }: SyncDashboardProps) {
  const orgId = organizationId || "";
  const [windowDays, setWindowDays] = useState<number>(14);
  const [runSync, runState] = useRunFluidaSyncMutation();

  const queryArgs = useMemo(
    () => ({ organizationId: orgId, limit: 10 }),
    [orgId]
  );

  const { data, isLoading, isError, refetch } = useGetFluidaSyncStatusQuery(queryArgs, {
    skip: !orgId,
  });
  const lastLog = data?.status?.lastLog ?? null;
  const lastErrors = (data?.logs?.[0]?.errors as { plannedErrors?: unknown[] } | undefined)?.plannedErrors;
  const lastStatus = lastLog?.status || (runState.isLoading ? "running" : "idle");
  const lastDuration = lastLog ? diffMinutes(lastLog.startedAt, lastLog.finishedAt) : null;

  if (!orgId) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Fluida sync</div>
            <h2>Manca organizationId</h2>
          </div>
        </div>
        <p className="hint">
          Passa <code>organizationId</code> nei parametri della pagina o come header
          <code>x-organization-id</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Fluida sync</div>
          <h2>Stato sincronizzazione</h2>
          <p className="hint">Org: {orgId}</p>
        </div>
        <button
          className="primary"
          disabled={runState.isLoading}
          onClick={() => runSync({ organizationId: orgId, windowDays }).unwrap().then(refetch)}
        >
          {runState.isLoading ? "Sync in corso..." : "Avvia sync"}
        </button>
      </div>

      <div className="controls">
        <label>
          Finestra giorni
          <input
            type="number"
            min={1}
            max={60}
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value))}
          />
        </label>
        <button className="ghost" onClick={() => refetch()} disabled={isLoading}>
          Aggiorna
        </button>
      </div>

      {isLoading ? <p className="hint">Caricamento...</p> : null}
      {isError ? <p className="hint">Errore nel caricamento dello stato.</p> : null}

      {data?.status ? (
        <div className="debug-box">
          <div className="debug-title">Stato</div>
          <div>Ultimo sync: {formatDate(data.status.lastSyncAt)}</div>
          <div>Ultimo sync OK: {formatDate(data.status.lastSuccessfulSyncAt)}</div>
          <div>Window giorni: {data.status.windowDays}</div>
          {lastLog ? (
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
              <div>Avvio: {formatDate(lastLog.startedAt)}</div>
              <div>Fine: {formatDate(lastLog.finishedAt)}</div>
              <div>Durata: {lastDuration ?? "-"}</div>
              <div>
                Periodo: {lastLog.rangeFrom.slice(0, 10)} - {lastLog.rangeTo.slice(0, 10)}
              </div>
              <div>
                Risultato: F {lastLog.recordsFetched} | I {lastLog.recordsInserted} | U{" "}
                {lastLog.recordsUpdated} | S {lastLog.recordsSkipped}
              </div>
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
          ) : null}
        </div>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Stato</th>
            <th>Avvio</th>
            <th>Fine</th>
            <th>Durata</th>
            <th>Fetch</th>
            <th>Ins</th>
            <th>Agg</th>
            <th>Skip</th>
            <th>Errori</th>
          </tr>
        </thead>
        <tbody>
          {data?.logs?.length ? (
            data.logs.map((log) => (
              <tr key={log.id}>
                <td>
                  {log.rangeFrom.slice(0, 10)} - {log.rangeTo.slice(0, 10)}
                </td>
                <td>
                  <span className={`status-pill status-${log.status}`}>{log.status}</span>
                </td>
                <td>{formatDate(log.startedAt)}</td>
                <td>{formatDate(log.finishedAt)}</td>
                <td>{diffMinutes(log.startedAt, log.finishedAt) ?? "-"}</td>
                <td>{log.recordsFetched}</td>
                <td>{log.recordsInserted}</td>
                <td>{log.recordsUpdated}</td>
                <td>{log.recordsSkipped}</td>
                <td>
                  {(log.errors as { plannedErrors?: unknown[] } | undefined)?.plannedErrors?.length ?? 0}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={10} className="muted">
                Nessun log disponibile.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
