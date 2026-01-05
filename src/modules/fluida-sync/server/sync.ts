import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchExports } from "@/lib/fluida";
import { decryptJson } from "@/modules/fluida-sync/server/crypto";

type FluidaStamping = Record<string, unknown>;

type DayKey = {
  contractId: string;
  dayKey: string;
};

type SyncStats = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  dirtyDays: number;
};

type SyncRunResult = {
  logId: string;
  stats: SyncStats;
};

type SyncStatus = {
  organizationId: string;
  companyId: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  windowDays: number;
  lastLog?: {
    id: string;
    status: string;
    rangeFrom: string;
    rangeTo: string;
    startedAt: string;
    finishedAt: string | null;
    recordsFetched: number;
    recordsInserted: number;
    recordsUpdated: number;
    recordsSkipped: number;
  } | null;
};

const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 60;

type FluidaSecrets = {
  apiKey?: string;
  oauthToken?: string;
};

type FluidaSettings = {
  apiUrl: string;
  authMethod: "apikey" | "oauth";
  apiKeyHeader: string;
  companyId: string | null;
  secrets: FluidaSecrets;
};

type PlannedInfo = {
  shift: string;
  location: string;
};

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function clampWindowDays(value?: number | null) {
  if (!value || Number.isNaN(value)) return DEFAULT_WINDOW_DAYS;
  return Math.max(1, Math.min(MAX_WINDOW_DAYS, Math.floor(value)));
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function pickFirstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value) return value;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const str = typeof value === "string" ? value : String(value);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function valuesEqual(a: unknown, b: unknown) {
  return stableStringify(a) === stableStringify(b);
}

function getAuthHeaders(settings: FluidaSettings) {
  const headers: Record<string, string> = {};
  if (settings.authMethod === "apikey") {
    if (!settings.secrets.apiKey) throw new Error("Fluida API key missing");
    headers[settings.apiKeyHeader] = settings.secrets.apiKey;
  } else {
    if (!settings.secrets.oauthToken) throw new Error("Fluida OAuth token missing");
    headers.Authorization = `Bearer ${settings.secrets.oauthToken}`;
  }
  return headers;
}

function baseFromApiUrl(apiUrl: string) {
  const apiIndex = apiUrl.indexOf("/api/v1");
  if (apiIndex !== -1) {
    return apiUrl.slice(0, apiIndex).replace(/\/$/, "");
  }
  const stampingsIndex = apiUrl.indexOf("/stampings");
  if (stampingsIndex !== -1) {
    return apiUrl.slice(0, stampingsIndex).replace(/\/$/, "");
  }
  return apiUrl.replace(/\/$/, "");
}

function buildStampingsUrl(settings: FluidaSettings) {
  const urlBase = settings.apiUrl;
  if (!urlBase) throw new Error("Fluida API URL missing");

  let url = urlBase;
  const baseLower = urlBase.toLowerCase();
  if ((!baseLower.includes("/api/v1") && !baseLower.includes("/stampings")) || baseLower === "https://api.fluida.io") {
    if (!settings.companyId) throw new Error("Fluida company id missing");
    url = `${urlBase.replace(/\\/$/, "")}/api/v1/stampings/list/${settings.companyId}`;
  } else {
    if (settings.companyId && url.includes("{company_id}")) url = url.replace("{company_id}", settings.companyId);
    else if (settings.companyId && url.endsWith("/")) url = `${url}${settings.companyId}`;
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
    throw new Error(
      `Fluida request failed (${res.status}): ${typeof data === "string" ? data : "see logs"}`
    );
  }
  return res.json();
}

async function fetchStampings(settings: FluidaSettings, params: Record<string, string>) {
  const url = buildStampingsUrl(settings);
  const headers = getAuthHeaders(settings);
  const qs = new URLSearchParams(params).toString();
  const data = await requestJson(qs ? `${url}?${qs}` : url, { headers });
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { items?: unknown[] }).items)) return (data as { items: unknown[] }).items;
  if (data && Array.isArray((data as { data?: unknown[] }).data)) return (data as { data: unknown[] }).data;
  return [];
}

async function fetchCalendarSummaryCustom(settings: FluidaSettings, date: string) {
  if (!settings.companyId) throw new Error("Fluida company id missing");
  const base = baseFromApiUrl(settings.apiUrl);
  const candidates = [
    `${base}/api/v1/calendar/company/${settings.companyId}`,
    `${base}/api/v1/companies/${settings.companyId}/calendar`,
    `${base}/api/v1/plannings/company/${settings.companyId}`,
    `${base}/api/v1/plannings/${settings.companyId}`,
    `${base}/api/v1/calendar/summary_by_day/${settings.companyId}`,
    `${base}/api/v1/calendar/actual_calendar_with_summary/${settings.companyId}`,
    `${base}/api/v1/calendar/summary/${settings.companyId}`,
    `${base}/api/v1/contracts/${settings.companyId}/calendar`,
    `${base}/api/v1/calendar/events/${settings.companyId}`,
    `${base}/api/v1/schedules/${settings.companyId}`,
    `${base}/api/v1/shifts/${settings.companyId}`,
    `${base}/api/v1/plans/${settings.companyId}`,
  ];
  const headers = getAuthHeaders(settings);
  for (const url of candidates) {
    const qs = new URLSearchParams({ date }).toString();
    try {
      return await requestJson(`${url}?${qs}`, { headers });
    } catch {
      // try next
    }
    const qsRange = new URLSearchParams({ start_date: date, end_date: date }).toString();
    try {
      return await requestJson(`${url}?${qsRange}`, { headers });
    } catch {
      // try next
    }
  }
  return null;
}

async function fetchPlannedSubsidiaryCustom(
  settings: FluidaSettings,
  contractId: string,
  day: string,
  time: string,
  direction: string
) {
  const base = baseFromApiUrl(settings.apiUrl);
  const url = `${base}/contracts/${contractId}/planned_subsidiary/date/${day}/time/${time}/direction/${direction}`;
  const candidates = [url, `${base}/api/v1${url.replace(base, "")}`];
  const headers = getAuthHeaders(settings);
  for (const cand of candidates) {
    try {
      return await requestJson(cand, { headers });
    } catch {
      // try next
    }
  }
  return null;
}

function extractPlannedInfo(raw: unknown, contractId: string, dayKey: string): PlannedInfo | null {
  const items = Array.isArray(raw) ? raw : (raw as { data?: unknown }).data ?? (raw as { items?: unknown }).items ?? raw;
  if (!Array.isArray(items)) return null;

  for (const item of items as Array<Record<string, unknown>>) {
    const itemContractId =
      (item.contract_id as string) || (item.contractId as string) || (item.contract as string) || "";
    if (itemContractId && itemContractId !== contractId) continue;

    const days = Array.isArray(item.days) ? (item.days as Array<Record<string, unknown>>) : [];
    if (days.length > 0) {
      for (const day of days) {
        const dayVal = (day.day as string) || (day.date as string) || "";
        if (dayVal && dayVal !== dayKey) continue;
        const planned =
          (day.plan_name as string) ||
          (day.shift_name as string) ||
          (day.planned_name as string) ||
          (day.schedule as string) ||
          (day.type as string) ||
          (day.notes as string) ||
          (day.summary as string) ||
          (day.plan as string) ||
          "";
        const location =
          (day.subsidiary_name as string) ||
          (day.location as string) ||
          (day.site_name as string) ||
          (day.site as string) ||
          (day.location_name as string) ||
          (day.workplace as string) ||
          (day.place as string) ||
          (day.location_description as string) ||
          "";
        const plannedTrim = String(planned || "").trim();
        const locationTrim = String(location || "").trim();
        if (plannedTrim || locationTrim) {
          return { shift: plannedTrim, location: locationTrim };
        }
      }
    }

    const dayFromItem = (item.day as string) || (item.date as string) || "";
    if (dayFromItem && dayFromItem !== dayKey) continue;

    const planned =
      (item.overrided_shift_name as string) ||
      (item.shift_name as string) ||
      (item.shift as string) ||
      (item.schedule as string) ||
      (item.type as string) ||
      "";

    const flexibleSchedule = Array.isArray(item.flexible_schedule)
      ? (item.flexible_schedule as Array<Record<string, unknown>>)
      : [];
    const actualCalendar = Array.isArray(item.actual_calendar)
      ? (item.actual_calendar as Array<Record<string, unknown>>)
      : [];
    const schedule = Array.isArray(item.schedule)
      ? (item.schedule as Array<Record<string, unknown>>)
      : [];

    const flexWorkplace = flexibleSchedule[0] as Record<string, unknown> | undefined;
    const actualWorkplace = actualCalendar[0] as Record<string, unknown> | undefined;
    const scheduleWorkplace = schedule[0] as Record<string, unknown> | undefined;

    const location =
      (item.subsidiary_name as string) ||
      (flexWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
      (actualWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
      (scheduleWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
      "";

    const plannedTrim = String(planned || "").trim();
    const locationTrim = String(location || "").trim();
    if (plannedTrim || locationTrim) {
      return { shift: plannedTrim, location: locationTrim };
    }
  }
  return null;
}

async function loadFluidaSettings(organizationId: string): Promise<FluidaSettings | null> {
  const settings = await prisma.fluidaIntegrationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings) return null;

  const secrets = decryptJson({
    ciphertext: settings.encryptedData,
    iv: settings.iv,
    authTag: settings.authTag,
  }) as FluidaSecrets;

  const authMethod = settings.authMethod === "oauth" ? "oauth" : "apikey";

  return {
    apiUrl: settings.apiUrl,
    authMethod,
    apiKeyHeader: settings.apiKeyHeader || "x-fluida-app-uuid",
    companyId: settings.companyId,
    secrets,
  };
}

function normalizeStamping(raw: FluidaStamping, companyId: string | null) {
  const fluidaId =
    pickFirstString(raw, ["id", "stamping_id", "stampingId", "uuid", "_id"]) ?? null;
  if (!fluidaId) return null;

  const stampingAt =
    parseDate(raw.timestamp) ||
    parseDate(raw.time) ||
    parseDate(raw.server_clock_at) ||
    parseDate(raw.clock_at) ||
    parseDate(raw.stamping_at) ||
    parseDate(raw.date_time);
  if (!stampingAt) return null;

  const contractId = pickFirstString(raw, ["contract_id", "contractId", "contract"]);
  const userId = pickFirstString(raw, ["user_id", "userId", "user"]);
  const direction = pickFirstString(raw, ["direction", "clock_type", "type"]);
  const deviceId = pickFirstString(raw, ["device_id", "deviceId", "clock_id"]);
  const deviceType = pickFirstString(raw, ["stamping_device_type", "device_type"]);
  const subsidiaryId = pickFirstString(raw, ["subsidiary_id", "subsidiaryId", "workplace_id"]);
  const note = pickFirstString(raw, ["note", "notes"]);

  const dayKey = toIsoDate(stampingAt);

  return {
    fluidaId,
    companyId,
    contractId,
    userId,
    stampingAt,
    dayKey,
    direction,
    deviceId,
    deviceType,
    subsidiaryId,
    note,
    raw,
  };
}

function buildSnapshot(data: {
  fluidaId: string;
  companyId: string | null;
  contractId: string | null;
  userId: string | null;
  stampingAt: Date;
  dayKey: string | null;
  direction: string | null;
  deviceId: string | null;
  deviceType: string | null;
  subsidiaryId: string | null;
  note: string | null;
  raw: unknown;
}) {
  return {
    fluidaId: data.fluidaId,
    companyId: data.companyId,
    contractId: data.contractId,
    userId: data.userId,
    stampingAt: data.stampingAt.toISOString(),
    dayKey: data.dayKey,
    direction: data.direction,
    deviceId: data.deviceId,
    deviceType: data.deviceType,
    subsidiaryId: data.subsidiaryId,
    note: data.note,
    raw: data.raw,
  };
}

function diffSnapshots(before: Record<string, unknown>, after: Record<string, unknown>) {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  Object.keys(after).forEach((key) => {
    const beforeVal = before[key];
    const afterVal = after[key];
    if (!valuesEqual(beforeVal, afterVal)) {
      diff[key] = { before: beforeVal, after: afterVal };
    }
  });
  return diff;
}

function serializeError(err: unknown) {
  if (!err) return { message: "Unknown error" };
  if (err instanceof Error) {
    const e = err as Error & { details?: unknown };
    return { message: e.message, details: e.details };
  }
  return { message: String(err) };
}

async function upsertStampings(params: {
  organizationId: string;
  companyId: string | null;
  items: FluidaStamping[];
  triggeredBy: string;
}) {
  const { organizationId, companyId, items, triggeredBy } = params;
  const dirtyDays = new Map<string, DayKey>();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const normalized = normalizeStamping(item, companyId);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.stamping.findUnique({
      where: {
        organizationId_fluidaId: {
          organizationId,
          fluidaId: normalized.fluidaId,
        },
      },
    });

    if (!existing) {
      await prisma.stamping.create({
        data: {
          organizationId,
          fluidaId: normalized.fluidaId,
          companyId: normalized.companyId,
          contractId: normalized.contractId,
          userId: normalized.userId,
          stampingAt: normalized.stampingAt,
          dayKey: normalized.dayKey,
          direction: normalized.direction,
          deviceId: normalized.deviceId,
          deviceType: normalized.deviceType,
          subsidiaryId: normalized.subsidiaryId,
          note: normalized.note,
          raw: normalized.raw as Prisma.InputJsonValue,
        },
      });
      inserted += 1;
      if (normalized.contractId) {
        dirtyDays.set(`${normalized.contractId}:${normalized.dayKey}`, {
          contractId: normalized.contractId,
          dayKey: normalized.dayKey,
        });
      }
      continue;
    }

    const before = buildSnapshot({
      fluidaId: existing.fluidaId,
      companyId: existing.companyId,
      contractId: existing.contractId,
      userId: existing.userId,
      stampingAt: existing.stampingAt,
      dayKey: existing.dayKey,
      direction: existing.direction,
      deviceId: existing.deviceId,
      deviceType: existing.deviceType,
      subsidiaryId: existing.subsidiaryId,
      note: existing.note,
      raw: existing.raw,
    });

    const after = buildSnapshot({
      fluidaId: normalized.fluidaId,
      companyId: normalized.companyId,
      contractId: normalized.contractId,
      userId: normalized.userId,
      stampingAt: normalized.stampingAt,
      dayKey: normalized.dayKey,
      direction: normalized.direction,
      deviceId: normalized.deviceId,
      deviceType: normalized.deviceType,
      subsidiaryId: normalized.subsidiaryId,
      note: normalized.note,
      raw: normalized.raw,
    });

    const diff = diffSnapshots(before, after);
    const changedFields = Object.keys(diff);
    if (changedFields.length === 0) {
      skipped += 1;
      continue;
    }

    await prisma.$transaction([
      prisma.stampingChangeLog.create({
        data: {
          organizationId,
          stampingId: existing.id,
          fluidaId: existing.fluidaId,
          changedBy: `system:fluida_sync:${triggeredBy}`,
          changeReason: "fluida_sync",
          before,
          after,
          diff,
          changedFields,
        },
      }),
      prisma.stamping.update({
        where: { id: existing.id },
        data: {
          companyId: normalized.companyId,
          contractId: normalized.contractId,
          userId: normalized.userId,
          stampingAt: normalized.stampingAt,
          dayKey: normalized.dayKey,
          direction: normalized.direction,
          deviceId: normalized.deviceId,
          deviceType: normalized.deviceType,
          subsidiaryId: normalized.subsidiaryId,
          note: normalized.note,
          raw: normalized.raw as Prisma.InputJsonValue,
        },
      }),
    ]);

    updated += 1;
    if (normalized.contractId) {
      dirtyDays.set(`${normalized.contractId}:${normalized.dayKey}`, {
        contractId: normalized.contractId,
        dayKey: normalized.dayKey,
      });
    }
  }

  return { inserted, updated, skipped, dirtyDays: Array.from(dirtyDays.values()) };
}

async function rebuildDaySummary(params: {
  organizationId: string;
  companyId: string | null;
  contractId: string;
  dayKey: string;
  settings?: FluidaSettings | null;
}) {
  const { organizationId, companyId, contractId, dayKey, settings } = params;
  const dayStart = startOfDay(new Date(`${dayKey}T00:00:00Z`));
  const dayEnd = endOfDay(new Date(`${dayKey}T00:00:00Z`));

  const stampings = await prisma.stamping.findMany({
    where: {
      organizationId,
      contractId,
      stampingAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { stampingAt: "asc" },
  });

  if (stampings.length === 0) {
    await prisma.stampingDaySummary.deleteMany({
      where: { organizationId, companyId, contractId, day: dayStart },
    });
    return;
  }

  let minutesWorked: number | null = null;
  if (stampings.length >= 2) {
    const first = stampings[0].stampingAt.getTime();
    const last = stampings[stampings.length - 1].stampingAt.getTime();
    minutesWorked = Math.max(0, Math.round((last - first) / 60000));
  }

  let planned: PlannedInfo | null = null;
  if (settings) {
    const cal = await fetchCalendarSummaryCustom(settings, dayKey);
    planned = extractPlannedInfo(cal, contractId, dayKey);
    if ((!planned || !planned.location) && stampings.length > 0) {
      const first = stampings[0];
      const time = first.stampingAt.toISOString().slice(11, 19);
      const direction = (first.direction || "IN").toUpperCase();
      const ps = await fetchPlannedSubsidiaryCustom(settings, contractId, dayKey, time, direction);
      if (ps) {
        const psAny = ps as Record<string, unknown>;
        let loc = "";
        if (psAny.subsidiary_name) loc = String(psAny.subsidiary_name);
        else if (psAny.name) loc = String(psAny.name);
        else if (psAny.subsidiary && (psAny.subsidiary as Record<string, unknown>).name) {
          loc = String((psAny.subsidiary as Record<string, unknown>).name);
        } else if (psAny.subsidiary && (psAny.subsidiary as Record<string, unknown>).label) {
          loc = String((psAny.subsidiary as Record<string, unknown>).label);
        }
        const shift = String((psAny.shift_name as string) || (psAny.shift as string) || "").trim();
        planned = {
          shift: shift || planned?.shift || "",
          location: String(loc || "").trim() || planned?.location || "",
        };
      }
    }
  }

  const summary = await prisma.stampingDaySummary.upsert({
    where: {
      organizationId_companyId_contractId_day: {
        organizationId,
        companyId,
        contractId,
        day: dayStart,
      },
    },
    create: {
      organizationId,
      companyId,
      contractId,
      day: dayStart,
      minutesWorked,
      plannedShift: planned?.shift || null,
      plannedLocation: planned?.location || null,
      source: "fluida",
    },
    update: {
      minutesWorked,
      plannedShift: planned?.shift || null,
      plannedLocation: planned?.location || null,
      source: "fluida",
    },
  });

  await prisma.stamping.updateMany({
    where: {
      organizationId,
      contractId,
      stampingAt: { gte: dayStart, lte: dayEnd },
    },
    data: {
      daySummaryId: summary.id,
      dayKey,
    },
  });
}

export async function runFluidaSync(params: {
  organizationId: string;
  triggeredBy: string;
  windowDays?: number | null;
}) : Promise<SyncRunResult> {
  const { organizationId, triggeredBy } = params;
  const settings = await loadFluidaSettings(organizationId);
  const companyId = settings?.companyId ?? process.env.FLUIDA_COMPANY_ID ?? null;

  const existingState = await prisma.stampingSyncState.findUnique({
    where: { organizationId },
  });

  const windowDays = clampWindowDays(params.windowDays ?? existingState?.windowDays);
  const now = new Date();
  const rangeTo = endOfDay(now);
  const rangeFrom = startOfDay(new Date(rangeTo.getTime() - (windowDays - 1) * 86400000));

  const state = await prisma.stampingSyncState.upsert({
    where: { organizationId },
    create: {
      organizationId,
      companyId,
      windowDays,
      lastSyncAt: now,
    },
    update: {
      companyId,
      windowDays,
      lastSyncAt: now,
    },
  });

  const log = await prisma.stampingSyncLog.create({
    data: {
      organizationId,
      companyId: state.companyId,
      status: "running",
      rangeFrom,
      rangeTo,
    },
  });

  try {
    const items = settings
      ? ((await fetchStampings(settings, {
          from_date: toIsoDate(rangeFrom),
          to_date: toIsoDate(rangeTo),
        })) as FluidaStamping[])
      : ((await fetchExports({
          from_date: toIsoDate(rangeFrom),
          to_date: toIsoDate(rangeTo),
        })) as FluidaStamping[]);

    const upsertResult = await upsertStampings({
      organizationId,
      companyId: state.companyId,
      items,
      triggeredBy,
    });

    for (const day of upsertResult.dirtyDays) {
      await rebuildDaySummary({
        organizationId,
        companyId: state.companyId,
        contractId: day.contractId,
        dayKey: day.dayKey,
        settings: settings ?? undefined,
      });
    }

    const stats: SyncStats = {
      fetched: items.length,
      inserted: upsertResult.inserted,
      updated: upsertResult.updated,
      skipped: upsertResult.skipped,
      dirtyDays: upsertResult.dirtyDays.length,
    };

    await prisma.stampingSyncLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        recordsFetched: stats.fetched,
        recordsInserted: stats.inserted,
        recordsUpdated: stats.updated,
        recordsSkipped: stats.skipped,
      },
    });

    await prisma.stampingSyncState.update({
      where: { organizationId },
      data: {
        lastSuccessfulSyncAt: new Date(),
      },
    });

    return { logId: log.id, stats };
  } catch (err) {
    await prisma.stampingSyncLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errors: serializeError(err),
      },
    });
    throw err;
  }
}

export async function getFluidaSyncStatus(organizationId: string): Promise<SyncStatus> {
  const state = await prisma.stampingSyncState.findUnique({
    where: { organizationId },
  });

  const lastLog = await prisma.stampingSyncLog.findFirst({
    where: { organizationId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      rangeFrom: true,
      rangeTo: true,
      startedAt: true,
      finishedAt: true,
      recordsFetched: true,
      recordsInserted: true,
      recordsUpdated: true,
      recordsSkipped: true,
    },
  });

  return {
    organizationId,
    companyId: state?.companyId ?? null,
    lastSyncAt: state?.lastSyncAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt?.toISOString() ?? null,
    windowDays: state?.windowDays ?? DEFAULT_WINDOW_DAYS,
    lastLog: lastLog
      ? {
          ...lastLog,
          rangeFrom: lastLog.rangeFrom.toISOString(),
          rangeTo: lastLog.rangeTo.toISOString(),
          startedAt: lastLog.startedAt.toISOString(),
          finishedAt: lastLog.finishedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function listFluidaSyncLogs(organizationId: string, limit = 20) {
  const logs = await prisma.stampingSyncLog.findMany({
    where: { organizationId },
    orderBy: { startedAt: "desc" },
    take: Math.max(1, Math.min(limit, 100)),
  });

  return logs.map((log) => ({
    ...log,
    rangeFrom: log.rangeFrom.toISOString(),
    rangeTo: log.rangeTo.toISOString(),
    startedAt: log.startedAt.toISOString(),
    finishedAt: log.finishedAt?.toISOString() ?? null,
  }));
}
