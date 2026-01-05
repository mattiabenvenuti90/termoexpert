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
          {data.status.lastLog ? (
            <div>
              Ultimo log: {data.status.lastLog.status} (
              {formatDate(data.status.lastLog.startedAt)})
            </div>
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
            <th>Fetch</th>
            <th>Ins</th>
            <th>Agg</th>
            <th>Skip</th>
          </tr>
        </thead>
        <tbody>
          {data?.logs?.length ? (
            data.logs.map((log) => (
              <tr key={log.id}>
                <td>
                  {log.rangeFrom.slice(0, 10)} - {log.rangeTo.slice(0, 10)}
                </td>
                <td>{log.status}</td>
                <td>{formatDate(log.startedAt)}</td>
                <td>{formatDate(log.finishedAt)}</td>
                <td>{log.recordsFetched}</td>
                <td>{log.recordsInserted}</td>
                <td>{log.recordsUpdated}</td>
                <td>{log.recordsSkipped}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="muted">
                Nessun log disponibile.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
