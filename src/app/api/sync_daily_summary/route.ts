import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireOrganization } from "@/lib/organization";
import { prisma } from "@/lib/prisma";
import { toCsvRows } from "@/lib/csv";
import { fetchCalendarSummary, fetchSubsidiaries } from "@/lib/fluida";

function pickName(obj: Record<string, unknown> | null | undefined) {
  if (!obj) return "";
  return (
    (obj.name as string) ||
    (obj.full_name as string) ||
    (obj.fullName as string) ||
    (obj.label as string) ||
    (obj.description as string) ||
    ""
  );
}

function pickLocationName(obj: Record<string, unknown> | null | undefined) {
  if (!obj) return "";
  return (
    (obj.subsidiary_name as string) ||
    (obj.location as string) ||
    (obj.site_name as string) ||
    (obj.site as string) ||
    (obj.location_name as string) ||
    (obj.workplace as string) ||
    (obj.place as string) ||
    (obj.location_description as string) ||
    pickName(obj) ||
    ""
  );
}

function resolveDeviceType(
  raw: Record<string, unknown> | null | undefined,
  fallback?: string
) {
  const clockType = String(raw?.clock_type || "").trim().toLowerCase();
  const deviceType = String(raw?.stamping_device_type || "").trim().toLowerCase();
  if (clockType === "remote") {
    return deviceType ? `remote:${deviceType}` : "forzata";
  }
  if (deviceType) return deviceType;
  if (fallback) return fallback;
  return clockType || "";
}

function readClockType(
  raw: Record<string, unknown> | null | undefined,
  fallback?: string
) {
  const fromRaw = String(raw?.clock_type || "").trim().toLowerCase();
  if (fromRaw) return fromRaw;
  const fb = String(fallback || "").trim().toLowerCase();
  if (fb === "manual" || fb === "remote" || fb === "clock") return fb;
  return "";
}

function readStampingDeviceType(
  raw: Record<string, unknown> | null | undefined,
  fallback?: string
) {
  const fromRaw = String(raw?.stamping_device_type || "").trim().toLowerCase();
  if (fromRaw) return fromRaw;
  const fb = String(fallback || "").trim().toLowerCase();
  if (!fb) return "";
  if (fb === "remote" || fb === "manual" || fb === "clock") return "";
  return fb;
}

function extractPlannedInfoWithSubsidiaries(
  raw: unknown,
  contractId: string,
  dayKey: string,
  subsidiaryNameMap: Map<string, string>
) {
  const items = Array.isArray(raw)
    ? raw
    : (raw as { data?: unknown }).data ?? (raw as { items?: unknown }).items ?? raw;
  if (!Array.isArray(items)) return null;

  for (const c of items as Array<Record<string, unknown>>) {
    const cContractId =
      (c.contract_id as string) || (c.contractId as string) || (c.contract as string) || "";
    if (cContractId && cContractId !== contractId) continue;

    const days = Array.isArray(c.days) ? (c.days as Array<Record<string, unknown>>) : [];
    const dayFromItem = (c.day as string) || (c.date as string) || "";

    if (days.length > 0 && cContractId) {
      for (const d of days) {
        const dayVal = (d.day as string) || (d.date as string) || dayKey;
        if (dayVal && dayVal !== dayKey) continue;
        const planned =
          (d.plan_name as string) ||
          (d.shift_name as string) ||
          (d.planned_name as string) ||
          (d.schedule as string) ||
          (d.type as string) ||
          (d.notes as string) ||
          (d.summary as string) ||
          (d.plan as string) ||
          "";
        let location = pickLocationName(d);
        const subId = (d.subsidiary_id as string) || "";
        if ((!location || location.toLowerCase() === "subsidiary") && subId && subsidiaryNameMap.has(subId)) {
          location = subsidiaryNameMap.get(subId) || "";
        }
        const plannedTrim = String(planned || "").trim();
        const locationTrim = String(location || "").trim();
        if (plannedTrim || locationTrim) {
          return { shift: plannedTrim, location: locationTrim };
        }
      }
    } else if (dayFromItem) {
      if (dayFromItem && dayFromItem !== dayKey) continue;
      const planned =
        (c.overrided_shift_name as string) ||
        (c.shift_name as string) ||
        (c.shift as string) ||
        (c.schedule as string) ||
        (c.type as string) ||
        "";

      const subsidiaryIds = Array.isArray(c.subsidiary_ids)
        ? (c.subsidiary_ids as Array<string>)
        : [];
      const flexibleSchedule = Array.isArray(c.flexible_schedule)
        ? (c.flexible_schedule as Array<Record<string, unknown>>)
        : [];
      const actualCalendar = Array.isArray(c.actual_calendar)
        ? (c.actual_calendar as Array<Record<string, unknown>>)
        : [];
      const schedule = Array.isArray(c.schedule)
        ? (c.schedule as Array<Record<string, unknown>>)
        : [];

      const flexWorkplace = flexibleSchedule[0] as Record<string, unknown> | undefined;
      const actualWorkplace = actualCalendar[0] as Record<string, unknown> | undefined;
      const scheduleWorkplace = schedule[0] as Record<string, unknown> | undefined;

      const subId =
        (c.subsidiary_id as string) ||
        subsidiaryIds[0] ||
        (flexWorkplace?.workplace as Record<string, unknown> | undefined)?.id ||
        (actualWorkplace?.workplace as Record<string, unknown> | undefined)?.id ||
        (scheduleWorkplace?.workplace as Record<string, unknown> | undefined)?.id ||
        (actualWorkplace?.subsidiary_id as string) ||
        "";

      let location =
        (c.subsidiary_name as string) ||
        (flexWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
        (actualWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
        (scheduleWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
        "";
      if ((!location || location.toLowerCase() === "subsidiary") && subId && subsidiaryNameMap.has(subId)) {
        location = subsidiaryNameMap.get(subId) || "";
      }

      const plannedTrim = String(planned || "").trim();
      const locationTrim = String(location || "").trim();
      if (plannedTrim || locationTrim) {
        return { shift: plannedTrim, location: locationTrim };
      }
    }
  }
  return null;
}

function toDayStart(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const org = await requireOrganization(request, auth.userId);
    if (!org.ok) return org.response;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const includeCalendar =
      searchParams.get("include_calendar") === "1" ||
      searchParams.get("include_calendar") === "true" ||
      searchParams.get("include_calendar") === "yes";
    const wantsJson =
      (searchParams.get("format") ?? "").toLowerCase() === "json" ||
      (request.headers.get("accept") ?? "").includes("application/json");
    const debug = searchParams.get("debug") === "1" || searchParams.get("debug") === "true";
    const dayStart = toDayStart(date);

    const summaries = await prisma.stampingDaySummary.findMany({
      where: {
        organizationId: org.organizationId,
        day: dayStart,
      },
      include: {
        stampings: {
          orderBy: { stampingAt: "asc" },
        },
      },
    });

    if (includeCalendar) {
      const needsPlanned = summaries.some((summary) => !summary.plannedShift && !summary.plannedLocation);
      if (needsPlanned) {
        try {
          const [calendar, subsidiaries] = await Promise.all([
            fetchCalendarSummary({ start_date: date, end_date: date }),
            fetchSubsidiaries({ page_size: 200 }),
          ]);
          const subsidiaryNameMap = new Map<string, string>();
          if (Array.isArray(subsidiaries)) {
            for (const it of subsidiaries as Array<Record<string, unknown>>) {
              const id = (it.id as string) || (it.subsidiary_id as string) || "";
              if (!id) continue;
              const name = pickName(it) || (it.subsidiary_name as string) || "";
              if (name) subsidiaryNameMap.set(id, name);
            }
          }
          for (const summary of summaries) {
            if (!summary.contractId) continue;
            if (summary.plannedShift || summary.plannedLocation) continue;
            const planned = extractPlannedInfoWithSubsidiaries(
              calendar,
              summary.contractId,
              date,
              subsidiaryNameMap
            );
            if (planned && (planned.shift || planned.location)) {
              await prisma.stampingDaySummary.update({
                where: { id: summary.id },
                data: {
                  plannedShift: planned.shift || null,
                  plannedLocation: planned.location || null,
                },
              });
              summary.plannedShift = planned.shift || null;
              summary.plannedLocation = planned.location || null;
            }
          }
        } catch {
          // ignore calendar errors on read
        }
      }
    }

    const items = summaries.map((summary) => {
      const locs = new Set<string>();
      let entryLocation = "";
      let exitLocation = "";
      let entryTime = "";
      let exitTime = "";
      let entryDeviceType = "";
      let exitDeviceType = "";
      let entryClockType = "";
      let exitClockType = "";
      let entryStampingDeviceType = "";
      let exitStampingDeviceType = "";
      let personName = "";

      for (const r of summary.stampings) {
        const raw = (r.raw ?? null) as Record<string, unknown> | null;
        const loc =
          pickLocationName(raw) ||
          pickLocationName((raw?.subsidiary as Record<string, unknown>) || null) ||
          pickLocationName((raw?.location as Record<string, unknown>) || null) ||
          pickLocationName((raw?.site as Record<string, unknown>) || null) ||
          pickLocationName((raw?.workplace as Record<string, unknown>) || null) ||
          "";

        if (loc) locs.add(loc);

        const direction = String(r.direction || "").toUpperCase();
        if (direction === "IN" && !entryTime) {
          entryLocation = loc;
          entryTime = r.stampingAt.toISOString().slice(11, 19);
          entryDeviceType = resolveDeviceType(raw, String(r.deviceType || ""));
          entryClockType = readClockType(raw, String(r.deviceType || ""));
          entryStampingDeviceType = readStampingDeviceType(raw, String(r.deviceType || ""));
        }
        if (direction === "OUT") {
          exitLocation = loc;
          exitTime = r.stampingAt.toISOString().slice(11, 19);
          exitDeviceType = resolveDeviceType(raw, String(r.deviceType || ""));
          exitClockType = readClockType(raw, String(r.deviceType || ""));
          exitStampingDeviceType = readStampingDeviceType(raw, String(r.deviceType || ""));
        }

        if (!personName && raw) {
          const fn =
            (raw.first_name as string) ||
            (raw.firstname as string) ||
            (raw.user_firstname as string) ||
            (raw.user_first_name as string) ||
            "";
          const ln =
            (raw.last_name as string) ||
            (raw.lastname as string) ||
            (raw.user_lastname as string) ||
            (raw.user_last_name as string) ||
            "";
          const full = `${fn} ${ln}`.trim();
          personName =
            full ||
            (raw.user_name as string) ||
            (raw.user_full_name as string) ||
            (raw.employee_name as string) ||
            (raw.employee_full_name as string) ||
            "";
        }
      }

      return {
        contractId: summary.contractId ?? "",
        personName,
        day: date,
        workedMinutes: summary.minutesWorked ?? 0,
        totalDurationMinutes: summary.minutesWorked ?? 0,
        clockRecordsCount: summary.stampings.length,
        stampingLocations: Array.from(locs),
        entryLocation,
        entryTime,
        entryDeviceType,
        entryClockType,
        entryStampingDeviceType,
        exitLocation,
        exitTime,
        exitDeviceType,
        exitClockType,
        exitStampingDeviceType,
        plannedShift: summary.plannedShift ?? "",
        plannedLocation: summary.plannedLocation ?? "",
      };
    });

    if (wantsJson) {
      return NextResponse.json({
        date,
        items,
        ...(debug ? { organizationId: org.organizationId, dayStart: dayStart.toISOString() } : {}),
      });
    }

    const headers = [
      "contract_id",
      "person_name",
      "day",
      "duration_minutes",
      "total_duration_minutes",
      "clock_records_count",
      "stamping_locations",
      "entry_location",
      "entry_time",
      "exit_location",
      "exit_time",
    ];
    if (includeCalendar) {
      headers.push("planned_shift", "planned_location");
    }

    const rows = items.map((row) => [
      row.contractId ?? "",
      row.personName ?? "",
      row.day ?? "",
      row.workedMinutes ?? 0,
      row.totalDurationMinutes ?? 0,
      row.clockRecordsCount ?? 0,
      (row.stampingLocations ?? []).join(" | "),
      row.entryLocation ?? "",
      row.entryTime ?? "",
      row.exitLocation ?? "",
      row.exitTime ?? "",
      ...(includeCalendar ? [row.plannedShift ?? "", row.plannedLocation ?? ""] : []),
    ]);

    const csv = toCsvRows(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"sync_daily_summary_${date}.csv\"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
