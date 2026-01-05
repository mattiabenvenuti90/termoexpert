"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useGetFluidaSyncSettingsQuery,
  useSaveFluidaSyncSettingsMutation,
} from "../rtk/fluidaSyncApi";

type SyncSettingsProps = {
  organizationId?: string | null;
};

export function SyncSettings({ organizationId }: SyncSettingsProps) {
  const orgId = organizationId || "";
  const { data, isLoading, isError } = useGetFluidaSyncSettingsQuery(
    { organizationId: orgId },
    { skip: !orgId }
  );
  const [saveSettings, saveState] = useSaveFluidaSyncSettingsMutation();

  const [apiUrl, setApiUrl] = useState("");
  const [authMethod, setAuthMethod] = useState<"apikey" | "oauth">("apikey");
  const [apiKeyHeader, setApiKeyHeader] = useState("x-fluida-app-uuid");
  const [companyId, setCompanyId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [oauthToken, setOauthToken] = useState("");
  const [windowDays, setWindowDays] = useState(14);

  useEffect(() => {
    if (!data?.settings) return;
    setApiUrl(data.settings.apiUrl || "");
    setAuthMethod(data.settings.authMethod || "apikey");
    setApiKeyHeader(data.settings.apiKeyHeader || "x-fluida-app-uuid");
    setCompanyId(data.settings.companyId || "");
    setWindowDays(data.windowDays || 14);
  }, [data]);

  const hintSecret = useMemo(() => {
    if (!data?.settings) return "";
    if (authMethod === "apikey" && data.settings.hasApiKey) return "Gia impostata";
    if (authMethod === "oauth" && data.settings.hasOauthToken) return "Gia impostata";
    return "";
  }, [data, authMethod]);

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
          <h2>Impostazioni</h2>
          <p className="hint">Org: {orgId}</p>
        </div>
        <button
          className="primary"
          disabled={saveState.isLoading}
          onClick={() =>
            saveSettings({
              organizationId: orgId,
              apiUrl,
              authMethod,
              apiKeyHeader,
              companyId: companyId || null,
              apiKey: apiKey || undefined,
              oauthToken: oauthToken || undefined,
              windowDays,
            })
          }
        >
          {saveState.isLoading ? "Salvataggio..." : "Salva"}
        </button>
      </div>

      {isLoading ? <p className="hint">Caricamento...</p> : null}
      {isError ? <p className="hint">Errore nel caricamento impostazioni.</p> : null}

      <div className="controls">
        <label>
          API URL
          <input
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="https://api.fluida.io"
          />
        </label>
        <label>
          Auth
          <select
            value={authMethod}
            onChange={(event) => setAuthMethod(event.target.value as "apikey" | "oauth")}
          >
            <option value="apikey">API Key</option>
            <option value="oauth">OAuth</option>
          </select>
        </label>
        <label>
          API Key Header
          <input
            value={apiKeyHeader}
            onChange={(event) => setApiKeyHeader(event.target.value)}
          />
        </label>
        <label>
          Company ID
          <input
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          />
        </label>
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
      </div>

      <div className="controls">
        {authMethod === "apikey" ? (
          <label>
            API Key {hintSecret ? <span className="muted">({hintSecret})</span> : null}
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Inserisci per aggiornare"
            />
          </label>
        ) : (
          <label>
            OAuth Token {hintSecret ? <span className="muted">({hintSecret})</span> : null}
            <input
              type="password"
              value={oauthToken}
              onChange={(event) => setOauthToken(event.target.value)}
              placeholder="Inserisci per aggiornare"
            />
          </label>
        )}
      </div>
    </div>
  );
}
