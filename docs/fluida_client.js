const axios = require('axios');

function generateMockExports(count = 10) {
  const users = ['Mario Rossi', 'Luca Bianchi', 'Anna Verdi'];
  const locations = ['Cantiere A', 'Cantiere B', 'Ufficio'];
  const items = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const ts = new Date(now.getTime() - i * 15 * 60000).toISOString();
    items.push({
      id: `mock-${i+1}`,
      timestamp: ts,
      user: users[Math.floor(Math.random()*users.length)],
      location: locations[Math.floor(Math.random()*locations.length)],
      note: Math.random() > 0.8 ? 'permesso' : ''
    });
  }
  return items;
}

async function fetchExports(params = {}) {
  // Chiamata reale alle API Fluida.
  const urlBase = process.env.FLUIDA_API_URL;
  const authMethod = (process.env.FLUIDA_AUTH_METHOD || 'apikey').toLowerCase();
  const apiKey = process.env.FLUIDA_API_KEY;
  const apiKeyHeader = process.env.FLUIDA_API_KEY_HEADER_NAME || 'x-fluida-app-uuid';
  const oauthToken = process.env.FLUIDA_OAUTH_TOKEN;
  const companyId = process.env.FLUIDA_COMPANY_ID;

  if (!urlBase) throw new Error('FLUIDA_API_URL non impostato');

  // Costruisci URL standard per le timbrature se l'utente ha lasciato solo il dominio/base
  let url = urlBase;
  const baseLower = (urlBase || '').toLowerCase();
  if ((!baseLower.includes('/api/v1') && !baseLower.includes('/stampings')) || baseLower === 'https://api.fluida.io') {
    if (!companyId) throw new Error('FLUIDA_COMPANY_ID non impostato per endpoint stampings');
    url = `${urlBase.replace(/\/$/, '')}/api/v1/stampings/list/${companyId}`;
  } else {
    // Sostituisci {company_id} nell'URL se presente
    if (companyId && url.indexOf('{company_id}') !== -1) url = url.replace('{company_id}', companyId);
    else if (companyId && url.endsWith('/')) url = `${url}${companyId}`;
  }

  // Se non hanno fornito date, imposta un intervallo di default (ultimi 7 giorni)
  const paramsCopy = { ...params };
  if (!paramsCopy.from_date && !paramsCopy.to_date && !paramsCopy.from && !paramsCopy.to) {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    paramsCopy.from_date = from.toISOString().slice(0,10);
    paramsCopy.to_date = to.toISOString().slice(0,10);
  }

  const headers = {};
  if (authMethod === 'apikey') {
    if (!apiKey) throw new Error('FLUIDA_API_KEY non impostata');
    headers[apiKeyHeader] = apiKey;
  } else if (authMethod === 'oauth') {
    if (!oauthToken) throw new Error('FLUIDA_OAUTH_TOKEN non impostato');
    headers['Authorization'] = `Bearer ${oauthToken}`;
  }

  const resp = await axios.get(url, { headers, params: paramsCopy });
  const data = resp.data;
  if (Array.isArray(data)) return data;
  if (data && data.items) return data.items;
  // alcuni endpoint incapsulano i dati in altre proprietà
  if (data && data.data) return data.data;
  return [];
}

module.exports = { generateMockExports, fetchExports };

async function fetchDailyClockRecords(opts = {}) {
  const urlBase = process.env.FLUIDA_API_URL;
  const authMethod = (process.env.FLUIDA_AUTH_METHOD || 'apikey').toLowerCase();
  const apiKey = process.env.FLUIDA_API_KEY;
  const apiKeyHeader = process.env.FLUIDA_API_KEY_HEADER_NAME || 'x-fluida-app-uuid';
  const oauthToken = process.env.FLUIDA_OAUTH_TOKEN;
  const companyId = process.env.FLUIDA_COMPANY_ID;

  if (!urlBase) throw new Error('FLUIDA_API_URL non impostato');
  if (!companyId) throw new Error('FLUIDA_COMPANY_ID non impostato');

  const url = `${urlBase.replace(/\/$/, '')}/api/v1/stampings/${companyId}/daily_clock_records`;
  const headers = {};
  if (authMethod === 'apikey') {
    if (!apiKey) throw new Error('FLUIDA_API_KEY non impostata');
    headers[apiKeyHeader] = apiKey;
  } else if (authMethod === 'oauth') {
    if (!oauthToken) throw new Error('FLUIDA_OAUTH_TOKEN non impostato');
    headers['Authorization'] = `Bearer ${oauthToken}`;
  }

  // helper to perform request and surface useful errors
  async function tryRequest(optsReq) {
    try {
      const r = await axios(optsReq);
      return r.data;
    } catch (e) {
      // attach response info for caller if available
      const info = { message: e.message };
      if (e.response) {
        info.status = e.response.status;
        info.data = e.response.data;
        info.requestId = e.response.headers && (e.response.headers['x-fluida-request-uuid'] || e.response.headers['x-fluida-request-uuid'.toLowerCase()]);
      }
      const err = new Error('Fluida request failed');
      err.details = info;
      throw err;
    }
  }

  // Build candidate parameter sets in order of preference
  const date = opts.date || opts.start_date || opts.from_date || null;
  const endDate = opts.end_date || opts.to_date || null;

  const attempts = [];

  // 1) GET with start_date/end_date (existing approach)
  if (date) {
    attempts.push({ method: 'get', url, headers, params: { start_date: date, end_date: endDate || date } });
  }

  // 2) GET with from_date/to_date (some APIs expect these names)
  if (date) {
    attempts.push({ method: 'get', url, headers, params: { from_date: date, to_date: endDate || date } });
  }

  // 3) GET with single date param
  if (date) {
    attempts.push({ method: 'get', url, headers, params: { date } });
  }

  // 4) POST with JSON body (sometimes required)
  if (date) {
    attempts.push({ method: 'post', url, headers: { ...headers, 'Content-Type': 'application/json' }, data: { start_date: date, end_date: endDate || date } });
  }

  // Try attempts in sequence and return on first success
  let lastErr = null;
  for (const a of attempts) {
    try {
      return await tryRequest(a);
    } catch (e) {
      lastErr = e;
      console.warn('fetchDailyClockRecords attempt failed', a.method, a.params || a.data, e.details || e.message);
      // continue to next attempt
    }
  }

  // If none succeeded, throw the last error
  if (lastErr) throw lastErr;
  return null;
}

module.exports.fetchDailyClockRecords = fetchDailyClockRecords;

// Fetch list of contracts (people)
async function fetchContracts(opts = {}) {
  const urlBase = process.env.FLUIDA_API_URL;
  const authMethod = (process.env.FLUIDA_AUTH_METHOD || 'apikey').toLowerCase();
  const apiKey = process.env.FLUIDA_API_KEY;
  const apiKeyHeader = process.env.FLUIDA_API_KEY_HEADER_NAME || 'x-fluida-app-uuid';
  const oauthToken = process.env.FLUIDA_OAUTH_TOKEN;
  const companyId = process.env.FLUIDA_COMPANY_ID;

  if (!urlBase) throw new Error('FLUIDA_API_URL non impostato');

  const base = urlBase.replace(/\/$/, '');
  const headers = {};
  if (authMethod === 'apikey') {
    if (!apiKey) throw new Error('FLUIDA_API_KEY non impostata');
    headers[apiKeyHeader] = apiKey;
  } else if (authMethod === 'oauth') {
    if (!oauthToken) throw new Error('FLUIDA_OAUTH_TOKEN non impostato');
    headers['Authorization'] = `Bearer ${oauthToken}`;
  }

  const candidates = [];
  if (companyId) {
    candidates.push(`${base}/api/v1/contracts/${companyId}`);
    candidates.push(`${base}/api/v1/contracts/list/${companyId}`);
    candidates.push(`${base}/api/v1/contracts/${companyId}/list`);
    candidates.push(`${base}/contracts/${companyId}`);
  }
  candidates.push(`${base}/api/v1/contracts`);
  candidates.push(`${base}/contracts`);

  let lastErr = null;
  for (const url of candidates) {
    try {
      const r = await axios.get(url, { headers, params: { page_size: opts.page_size || 200 }, timeout: 10000 });
      const data = r.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.items)) return data.items;
      if (data && Array.isArray(data.data)) return data.data;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

module.exports.fetchContracts = fetchContracts;

async function fetchCalendarSummary(opts = {}) {
  const urlBase = process.env.FLUIDA_API_URL;
  const authMethod = (process.env.FLUIDA_AUTH_METHOD || 'apikey').toLowerCase();
  const apiKey = process.env.FLUIDA_API_KEY;
  const apiKeyHeader = process.env.FLUIDA_API_KEY_HEADER_NAME || 'x-fluida-app-uuid';
  const oauthToken = process.env.FLUIDA_OAUTH_TOKEN;
  const companyId = process.env.FLUIDA_COMPANY_ID;

  if (!urlBase) throw new Error('FLUIDA_API_URL non impostato');
  if (!companyId) throw new Error('FLUIDA_COMPANY_ID non impostato');

  const base = urlBase.replace(/\/$/, '');
  const candidates = [
    `${base}/api/v1/calendar/summary_by_day/${companyId}`,
    `${base}/api/v1/calendar/actual_calendar_with_summary/${companyId}`,
    `${base}/api/v1/calendar/summary/${companyId}`,
    `${base}/api/v1/contracts/${companyId}/calendar`,
    `${base}/api/v1/calendar/events/${companyId}`,
    `${base}/api/v1/schedules/${companyId}`,
    `${base}/api/v1/shifts/${companyId}`,
    `${base}/api/v1/plans/${companyId}`
  ];

  const headers = {};
  if (authMethod === 'apikey') {
    if (!apiKey) throw new Error('FLUIDA_API_KEY non impostata');
    headers[apiKeyHeader] = apiKey;
  } else if (authMethod === 'oauth') {
    if (!oauthToken) throw new Error('FLUIDA_OAUTH_TOKEN non impostato');
    headers['Authorization'] = `Bearer ${oauthToken}`;
  }

  async function tryRequest(optsReq) {
    try {
      const r = await axios(optsReq);
      return r.data;
    } catch (e) {
      const info = { message: e.message };
      if (e.response) {
        info.status = e.response.status;
        info.data = e.response.data;
      }
      const err = new Error('Fluida calendar request failed');
      err.details = info;
      throw err;
    }
  }

  const date = opts.date || opts.start_date || opts.from_date || null;
  const endDate = opts.end_date || opts.to_date || null;

  const attempts = [];
  for (const cand of candidates) {
    if (date) attempts.push({ method: 'get', url: cand, headers, params: { date } });
    if (date) attempts.push({ method: 'get', url: cand, headers, params: { start_date: date, end_date: endDate || date } });
    if (date) attempts.push({ method: 'post', url: cand, headers: { ...headers, 'Content-Type': 'application/json' }, data: { start_date: date, end_date: endDate || date } });
  }

  let lastErr = null;
  for (const a of attempts) {
    try {
      return await tryRequest(a);
    } catch (e) {
      lastErr = e;
      console.warn('fetchCalendarSummary attempt failed', a.url, a.params || a.data, e.details || e.message);
    }
  }

  if (lastErr) throw lastErr;
  return null;
}

module.exports.fetchCalendarSummary = fetchCalendarSummary;

// Fetch planned subsidiary for a contract at a given date/time/direction
async function fetchPlannedSubsidiary(opts = {}) {
  const urlBase = process.env.FLUIDA_API_URL;
  const authMethod = (process.env.FLUIDA_AUTH_METHOD || 'apikey').toLowerCase();
  const apiKey = process.env.FLUIDA_API_KEY;
  const apiKeyHeader = process.env.FLUIDA_API_KEY_HEADER_NAME || 'x-fluida-app-uuid';

  if (!urlBase) throw new Error('FLUIDA_API_URL non impostato');
  const contractId = opts.contract_id || opts.contractId || opts.contract;
  const date = opts.stamping_date || opts.date;
  const time = opts.stamping_time || opts.time || '09:00:00';
  const direction = opts.direction || 'IN';
  if (!contractId) throw new Error('contract_id required');
  if (!date) throw new Error('stamping_date required');

  const base = urlBase.replace(/\/$/, '');
  // doc shows path without /api/v1 prefix: /contracts/{contract_id}/planned_subsidiary/...
  const url = `${base}/contracts/${contractId}/planned_subsidiary/date/${date}/time/${time}/direction/${direction}`;

  const headers = {};
  if (authMethod === 'apikey') {
    if (!apiKey) throw new Error('FLUIDA_API_KEY non impostata');
    headers[apiKeyHeader] = apiKey;
  } else if (authMethod === 'oauth') {
    const oauthToken = process.env.FLUIDA_OAUTH_TOKEN;
    if (!oauthToken) throw new Error('FLUIDA_OAUTH_TOKEN non impostato');
    headers['Authorization'] = `Bearer ${oauthToken}`;
  }

  try {
    const r = await axios.get(url, { headers, timeout: 8000 });
    return r.data;
  } catch (e) {
    const info = { message: e.message };
    if (e.response) { info.status = e.response.status; info.data = e.response.data; }
    const err = new Error('Fluida planned_subsidiary request failed');
    err.details = info;
    throw err;
  }
}

module.exports.fetchPlannedSubsidiary = fetchPlannedSubsidiary;
