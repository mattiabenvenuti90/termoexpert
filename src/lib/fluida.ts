type FluidaError = Error & { details?: unknown };

function getAuthHeaders() {
  const authMethod = (process.env.FLUIDA_AUTH_METHOD || "apikey").toLowerCase();
  const apiKey = process.env.FLUIDA_API_KEY;
  const apiKeyHeader = process.env.FLUIDA_API_KEY_HEADER_NAME || "x-fluida-app-uuid";
  const oauthToken = process.env.FLUIDA_OAUTH_TOKEN;

  const headers: Record<string, string> = {};
  if (authMethod === "apikey") {
    if (!apiKey) throw new Error("FLUIDA_API_KEY non impostata");
    headers[apiKeyHeader] = apiKey;
  } else if (authMethod === "oauth") {
    if (!oauthToken) throw new Error("FLUIDA_OAUTH_TOKEN non impostato");
    headers.Authorization = `Bearer ${oauthToken}`;
  }
  return headers;
}

function buildStampingsUrl() {
  const urlBase = process.env.FLUIDA_API_URL;
  const companyId = process.env.FLUIDA_COMPANY_ID;
  if (!urlBase) throw new Error("FLUIDA_API_URL non impostato");

  let url = urlBase;
  const baseLower = urlBase.toLowerCase();
  if ((!baseLower.includes("/api/v1") && !baseLower.includes("/stampings")) || baseLower === "https://api.fluida.io") {
    if (!companyId) throw new Error("FLUIDA_COMPANY_ID non impostato per endpoint stampings");
    url = `${urlBase.replace(/\/$/, "")}/api/v1/stampings/list/${companyId}`;
  } else {
    if (companyId && url.includes("{company_id}")) url = url.replace("{company_id}", companyId);
    else if (companyId && url.endsWith("/")) url = `${url}${companyId}`;
  }
  return url;
}

async function requestJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw || null;
    }
    const details = {
      status: res.status,
      data,
      requestId: res.headers.get("x-fluida-request-uuid"),
      url,
      method: init.method ?? "GET",
    };
    const err: FluidaError = new Error("Fluida request failed");
    err.details = details;
    throw err;
  }
  return res.json();
}

export async function fetchExports(params: Record<string, string | number | null> = {}) {
  const url = buildStampingsUrl();
  const headers = getAuthHeaders();

  const paramsCopy: Record<string, string> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") return;
    paramsCopy[k] = String(v);
  });

  if (!paramsCopy.from_date && !paramsCopy.to_date && !paramsCopy.from && !paramsCopy.to) {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    paramsCopy.from_date = from.toISOString().slice(0, 10);
    paramsCopy.to_date = to.toISOString().slice(0, 10);
  }

  const qs = new URLSearchParams(paramsCopy).toString();
  const data = await requestJson(qs ? `${url}?${qs}` : url, { headers });
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

export async function fetchDailyClockRecords(opts: Record<string, string | null> = {}) {
  const urlBase = process.env.FLUIDA_API_URL;
  const companyId = process.env.FLUIDA_COMPANY_ID;
  if (!urlBase) throw new Error("FLUIDA_API_URL non impostato");
  if (!companyId) throw new Error("FLUIDA_COMPANY_ID non impostato");

  const url = `${urlBase.replace(/\/$/, "")}/api/v1/stampings/${companyId}/daily_clock_records`;
  const headers = getAuthHeaders();

  const date = opts.date || opts.start_date || opts.from_date || null;
  const endDate = opts.end_date || opts.to_date || null;

  const attempts: Array<{ method: string; params?: Record<string, string>; body?: Record<string, string> }> = [];
  if (date) {
    attempts.push({ method: "GET", params: { start_date: date, end_date: endDate || date } });
    attempts.push({ method: "GET", params: { from_date: date, to_date: endDate || date } });
    attempts.push({ method: "GET", params: { date } });
    attempts.push({ method: "POST", body: { start_date: date, end_date: endDate || date } });
  }

  let lastErr: unknown = null;
  const attemptsOut: Array<{ url: string; details?: unknown; message?: string; method: string; params?: Record<string, string> }> =
    [];
  for (const attempt of attempts) {
    try {
      if (attempt.method === "GET") {
        const qs = new URLSearchParams(attempt.params || {}).toString();
        return await requestJson(qs ? `${url}?${qs}` : url, { headers });
      }
      return await requestJson(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(attempt.body || {}),
      });
    } catch (err) {
      lastErr = err;
      const e = err as Error & { details?: unknown };
      attemptsOut.push({
        url,
        method: attempt.method,
        params: attempt.params || attempt.body || undefined,
        details: e.details,
        message: e.message,
      });
      // continue
    }
  }

  if (lastErr) {
    const err: FluidaError = new Error("Fluida request failed");
    err.details = { attempts: attemptsOut };
    throw err;
  }
  return null;
}

export async function fetchContracts(opts: Record<string, string | number> = {}) {
  const urlBase = process.env.FLUIDA_API_URL;
  const companyId = process.env.FLUIDA_COMPANY_ID;
  if (!urlBase) throw new Error("FLUIDA_API_URL non impostato");

  const base = urlBase.replace(/\/$/, "");
  const headers = getAuthHeaders();
  const pageSize = opts.page_size ? String(opts.page_size) : "200";

  const candidates: string[] = [];
  if (companyId) {
    candidates.push(`${base}/api/v1/contracts/company/${companyId}`);
    candidates.push(`${base}/api/v1/contracts/${companyId}`);
    candidates.push(`${base}/api/v1/contracts/list/${companyId}`);
    candidates.push(`${base}/api/v1/contracts/${companyId}/list`);
    candidates.push(`${base}/contracts/${companyId}`);
  }
  candidates.push(`${base}/api/v1/contracts`);
  candidates.push(`${base}/contracts`);

  let lastErr: unknown = null;
  const attempts: Array<{ url: string; details?: unknown; message?: string }> = [];
  for (const url of candidates) {
    try {
      const data = await requestJson(`${url}?page_size=${pageSize}`, { headers });
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.items)) return data.items;
      if (data && Array.isArray(data.data)) return data.data;
    } catch (err) {
      lastErr = err;
      const e = err as Error & { details?: unknown };
      attempts.push({ url, details: e.details, message: e.message });
    }
  }
  if (lastErr) {
    const err: FluidaError = new Error("Fluida request failed");
    err.details = { attempts, pageSize };
    throw err;
  }
  return [];
}

export async function fetchSubsidiaries(opts: Record<string, string | number> = {}) {
  const urlBase = process.env.FLUIDA_API_URL;
  const companyId = process.env.FLUIDA_COMPANY_ID;
  if (!urlBase) throw new Error("FLUIDA_API_URL non impostato");

  const base = urlBase.replace(/\/$/, "");
  const headers = getAuthHeaders();
  const pageSize = opts.page_size ? String(opts.page_size) : "200";

  const candidates: string[] = [];
  if (companyId) {
    candidates.push(`${base}/api/v1/subsidiaries/company/${companyId}`);
    candidates.push(`${base}/api/v1/subsidiaries/${companyId}`);
    candidates.push(`${base}/api/v1/companies/${companyId}/subsidiaries`);
    candidates.push(`${base}/subsidiaries/${companyId}`);
  }
  candidates.push(`${base}/api/v1/subsidiaries`);
  candidates.push(`${base}/subsidiaries`);

  let lastErr: unknown = null;
  const attempts: Array<{ url: string; details?: unknown; message?: string }> = [];
  for (const url of candidates) {
    try {
      const data = await requestJson(`${url}?page_size=${pageSize}`, { headers });
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.items)) return data.items;
      if (data && Array.isArray(data.data)) return data.data;
    } catch (err) {
      lastErr = err;
      const e = err as Error & { details?: unknown };
      attempts.push({ url, details: e.details, message: e.message });
    }
  }
  if (lastErr) {
    const err: FluidaError = new Error("Fluida request failed");
    err.details = { attempts, pageSize };
    throw err;
  }
  return [];
}

export async function fetchCalendarSummary(opts: Record<string, string | null> = {}) {
  const urlBase = process.env.FLUIDA_API_URL;
  const companyId = process.env.FLUIDA_COMPANY_ID;
  if (!urlBase) throw new Error("FLUIDA_API_URL non impostato");
  if (!companyId) throw new Error("FLUIDA_COMPANY_ID non impostato");

  const base = urlBase.replace(/\/$/, "");
  const candidates = [
    `${base}/api/v1/calendar/company/${companyId}`,
    `${base}/api/v1/companies/${companyId}/calendar`,
    `${base}/api/v1/plannings/company/${companyId}`,
    `${base}/api/v1/plannings/${companyId}`,
    `${base}/api/v1/calendar/summary_by_day/${companyId}`,
    `${base}/api/v1/calendar/actual_calendar_with_summary/${companyId}`,
    `${base}/api/v1/calendar/summary/${companyId}`,
    `${base}/api/v1/contracts/${companyId}/calendar`,
    `${base}/api/v1/calendar/events/${companyId}`,
    `${base}/api/v1/schedules/${companyId}`,
    `${base}/api/v1/shifts/${companyId}`,
    `${base}/api/v1/plans/${companyId}`,
  ];

  const headers = getAuthHeaders();
  const date = opts.date || opts.start_date || opts.from_date || null;
  const endDate = opts.end_date || opts.to_date || null;

  let lastErr: unknown = null;
  const attempts: Array<{ url: string; details?: unknown; message?: string; params?: Record<string, string> }> = [];
  for (const url of candidates) {
    if (date) {
      const qs = new URLSearchParams({ date }).toString();
      try {
        return await requestJson(`${url}?${qs}`, { headers });
      } catch (err) {
        lastErr = err;
        const e = err as Error & { details?: unknown };
        attempts.push({ url, details: e.details, message: e.message, params: { date } });
      }
    }
    if (date) {
      const qs = new URLSearchParams({ start_date: date, end_date: endDate || date }).toString();
      try {
        return await requestJson(`${url}?${qs}`, { headers });
      } catch (err) {
        lastErr = err;
        const e = err as Error & { details?: unknown };
        attempts.push({ url, details: e.details, message: e.message, params: { start_date: date, end_date: endDate || date } });
      }
    }
    if (date) {
      try {
        return await requestJson(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ start_date: date, end_date: endDate || date }),
        });
      } catch (err) {
        lastErr = err;
        const e = err as Error & { details?: unknown };
        attempts.push({ url, details: e.details, message: e.message, params: { start_date: date, end_date: endDate || date } });
      }
    }
  }
  if (lastErr) {
    const err: FluidaError = new Error("Fluida request failed");
    err.details = { attempts };
    throw err;
  }
  return null;
}

export async function fetchPlannedSubsidiary(opts: Record<string, string>) {
  const urlBase = process.env.FLUIDA_API_URL;
  if (!urlBase) throw new Error("FLUIDA_API_URL non impostato");

  const contractId = opts.contract_id || opts.contractId || opts.contract;
  const date = opts.stamping_date || opts.date;
  const time = opts.stamping_time || opts.time || "09:00:00";
  const direction = String(opts.direction || "in").toLowerCase();
  if (!contractId) throw new Error("contract_id required");
  if (!date) throw new Error("stamping_date required");

  const base = urlBase.replace(/\/$/, "");
  const candidates = [
    `${base}/api/v1/contracts/${contractId}/planned_subsidiary/date/${date}/time/${time}/direction/${direction}`,
    `${base}/contracts/${contractId}/planned_subsidiary/date/${date}/time/${time}/direction/${direction}`,
  ];
  const headers = getAuthHeaders();

  let lastErr: unknown = null;
  const attempts: Array<{ url: string; details?: unknown; message?: string }> = [];
  for (const url of candidates) {
    try {
      return await requestJson(url, { headers });
    } catch (err) {
      lastErr = err;
      const e = err as Error & { details?: unknown };
      attempts.push({ url, details: e.details, message: e.message });
    }
  }
  if (lastErr) {
    const err: FluidaError = new Error("Fluida request failed");
    err.details = { attempts };
    throw err;
  }
  return null;
}
