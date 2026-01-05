"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLazyGetContractsQuery, useLazyGetExportsQuery } from "@/services/api";
import { useShell } from "./app-shell";

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

export default function HomePage() {
  const { mock } = useShell();
  const [status, setStatus] = useState("");
  const [contractsStatus, setContractsStatus] = useState("");
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyCount, setDailyCount] = useState(0);

  const [triggerExports, exportsResult] = useLazyGetExportsQuery();
  const [triggerContracts, contractsResult] = useLazyGetContractsQuery();

  const exportsData = exportsResult.data ?? [];
  const contractsData = contractsResult.data ?? [];

  const loadExports = async () => {
    setStatus("Caricamento timbrature...");
    try {
      const data = await triggerExports({ mock, count: 50 }, true).unwrap();
      setStatus(`Caricati ${data.length} record`);
    } catch (err) {
      setStatus("Errore durante la lettura delle timbrature");
    }
  };

  const loadContracts = async () => {
    setContractsStatus("Caricamento contratti...");
    try {
      const data = await triggerContracts({ mock }, true).unwrap();
      setContractsStatus(`Trovati ${data.length} contratti`);
    } catch (err) {
      setContractsStatus("Errore durante la lettura dei contratti");
    }
  };

  useEffect(() => {
    loadExports();
    loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("dailySummaryCache");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        date?: string;
        items?: unknown[];
      };
      if (parsed.date) setDailyDate(parsed.date);
      if (Array.isArray(parsed.items)) setDailyCount(parsed.items.length);
    } catch {
      // ignore cache parsing errors
    }
  }, []);

  return (
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
          <Link className="ghost" href="/exports">
            Vai alle timbrature
          </Link>
          <Link className="primary" href="/daily">
            Vai al riepilogo
          </Link>
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
            <p className="card-desc">{status || "Record caricati"}</p>
            <Link className="ghost" href="/exports">
              Vai alla tabella
            </Link>
          </div>
          <div className="card">
            <p className="eyebrow">Riepilogo giornaliero</p>
            <h3>{dailyCount}</h3>
            <p className="card-desc">Righe per data {dailyDate}</p>
            <Link className="ghost" href="/daily">
              Vai al riepilogo
            </Link>
          </div>
          <div className="card">
            <p className="eyebrow">Contratti</p>
            <h3>{contractsData.length}</h3>
            <p className="card-desc">{contractsStatus || "Persone rilevate"}</p>
            <Link className="ghost" href="/contracts">
              Vai ai contratti
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
