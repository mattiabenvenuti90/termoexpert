import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateMockDailySummary } from "@/lib/mock";
import { toCsvRows } from "@/lib/csv";
import {
  fetchCalendarSummary,
  fetchContracts,
  fetchDailyClockRecords,
  fetchPlannedSubsidiary,
  fetchSubsidiaries,
} from "@/lib/fluida";

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

function pickPersonName(obj: Record<string, unknown> | null | undefined) {
  if (!obj) return "";
  const fn =
    (obj.first_name as string) ||
    (obj.firstname as string) ||
    (obj.user_firstname as string) ||
    (obj.user_first_name as string) ||
    "";
  const ln =
    (obj.last_name as string) ||
    (obj.lastname as string) ||
    (obj.user_lastname as string) ||
    (obj.user_last_name as string) ||
    "";
  const full = `${fn} ${ln}`.trim();
  return (
    full ||
    (obj.user_name as string) ||
    (obj.user_full_name as string) ||
    (obj.employee_name as string) ||
    (obj.employee_full_name as string) ||
    (obj.contract_name as string) ||
    pickName(obj) ||
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

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const includeCalendar =
    searchParams.get("include_calendar") === "1" ||
    searchParams.get("include_calendar") === "true" ||
    searchParams.get("include_calendar") === "yes";
  const wantsJson =
    (searchParams.get("format") ?? "").toLowerCase() === "json" ||
    (request.headers.get("accept") ?? "").includes("application/json");
  const useMock = searchParams.get("mock") === "1" || searchParams.get("mock") === "true";
  const debug = searchParams.get("debug") === "1" || searchParams.get("debug") === "true";

  let entries: Array<Record<string, unknown>> = [];
  if (useMock) {
    entries = generateMockDailySummary(date, 25);
  } else {
    let result: Array<Record<string, unknown>> = [];
    let data: unknown;
    try {
      data = await fetchDailyClockRecords({ date });
    } catch (err) {
      const e = err as Error & { details?: unknown };
      if (debug) {
        return NextResponse.json({ error: e.message, details: e.details ?? null }, { status: 500 });
      }
      throw err;
    }
    if (Array.isArray(data)) result = data;
    else if (data && (data as { data?: unknown }).data) result = (data as { data?: unknown }).data as Array<Record<string, unknown>>;
    else if (data && (data as { items?: unknown }).items) result = (data as { items?: unknown }).items as Array<Record<string, unknown>>;
    else if (data) result = data as Array<Record<string, unknown>>;

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "Nessun dato trovato" }, { status: 404 });
    }

    const contractNameMap = new Map<string, string>();
    const userIdNameMap = new Map<string, string>();
    const subsidiaryNameMap = new Map<string, string>();
    const needsContractNames = result.some((c) => {
      const name =
        pickPersonName(c) ||
        pickPersonName((c.user as Record<string, unknown>) || null) ||
        pickPersonName((c.employee as Record<string, unknown>) || null) ||
        pickPersonName((c.person as Record<string, unknown>) || null) ||
        pickPersonName((c.worker as Record<string, unknown>) || null) ||
        "";
      const contractId = (c.contract_id as string) || (c.contractId as string) || (c.contract as string) || "";
      return !name && !!contractId;
    });

    let contractSample: Record<string, unknown> | null = null;
    if (needsContractNames) {
      try {
        const contracts = await fetchContracts({ page_size: 200 });
        const contractList = Array.isArray(contracts) ? contracts : [];
        contractSample = contractList[0] || null;
        for (const it of contractList as Array<Record<string, unknown>>) {
          const id = (it.id as string) || (it.contract_id as string) || (it.contractId as string) || "";
          if (!id) continue;
          const full = pickPersonName(it);
          const fallback = (it.name as string) || (it.surname as string) || "";
          contractNameMap.set(id, full || fallback);
          const userId = (it.user_id as string) || (it.userId as string) || "";
          if (userId && (full || fallback)) userIdNameMap.set(userId, full || fallback);
        }
      } catch {
        // ignore contract lookup failures
      }
    }

    const needsSubsidiaries = result.some((c) => {
      const days = Array.isArray(c.days) ? (c.days as Array<Record<string, unknown>>) : [];
      return days.some((d) => {
        const records = Array.isArray(d.clock_records) ? (d.clock_records as Array<Record<string, unknown>>) : [];
        return records.some((r) => !!r.subsidiary_id || !!r.contract_subsidiary_id);
      });
    });

    if (needsSubsidiaries) {
      try {
        const subsidiaries = await fetchSubsidiaries({ page_size: 200 });
        const list = Array.isArray(subsidiaries) ? subsidiaries : [];
        for (const it of list as Array<Record<string, unknown>>) {
          const id = (it.id as string) || (it.subsidiary_id as string) || "";
          if (!id) continue;
          const name = pickName(it) || (it.subsidiary_name as string) || "";
          if (name) subsidiaryNameMap.set(id, name);
        }
      } catch {
        // ignore subsidiary lookup failures
      }
    }

    let plannedInfo: Record<string, { shift: string; location: string }> = {};
    let calendarDebug: { error?: unknown; sample?: unknown } | null = null;
    if (includeCalendar) {
      try {
        const cal = await fetchCalendarSummary({ date });
        let calItems = Array.isArray(cal) ? cal : (cal as { data?: unknown }).data ?? (cal as { items?: unknown }).items ?? cal;
        calendarDebug = debug ? { sample: calItems } : null;
        if (Array.isArray(calItems)) {
          for (const c of calItems) {
            const contractId =
              (c as { contract_id?: string; contractId?: string; contract?: string }).contract_id ||
              (c as { contractId?: string }).contractId ||
              (c as { contract?: string }).contract ||
              null;
            const userId = (c as { user_id?: string; userId?: string }).user_id || (c as { userId?: string }).userId || null;
            const days = Array.isArray((c as { days?: unknown[] }).days) ? (c as { days?: unknown[] }).days : [];
            const dayFromItem = (c as { day?: string; date?: string }).day || (c as { date?: string }).date || null;

            if (days.length > 0 && contractId) {
              for (const d of days as Array<Record<string, unknown>>) {
                const dayVal = (d.day as string) || (d.date as string) || date;
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
                let location =
                  (d.subsidiary_name as string) ||
                  (d.location as string) ||
                  (d.site_name as string) ||
                  (d.site as string) ||
                  (d.location_name as string) ||
                  (d.workplace as string) ||
                  (d.place as string) ||
                  (d.location_description as string) ||
                  "";
                const subId = (d.subsidiary_id as string) || "";
                if (!location || location.toLowerCase() === "subsidiary") {
                  if (subId && subsidiaryNameMap.has(subId)) location = subsidiaryNameMap.get(subId) || "";
                }
                plannedInfo[`${contractId}_${dayVal}`] = {
                  shift: String(planned || "").trim(),
                  location: String(location || "").trim(),
                };
              }
            } else if (dayFromItem && (contractId || userId)) {
              const planned =
                (c as { overrided_shift_name?: string }).overrided_shift_name ||
                (c as { shift_name?: string }).shift_name ||
                (c as { shift?: string }).shift ||
                (c as { schedule?: string }).schedule ||
                (c as { type?: string }).type ||
                "";

              const subsidiaryIds = Array.isArray((c as { subsidiary_ids?: unknown[] }).subsidiary_ids)
                ? ((c as { subsidiary_ids?: unknown[] }).subsidiary_ids as unknown[])
                : [];
              const flexibleSchedule = Array.isArray((c as { flexible_schedule?: unknown[] }).flexible_schedule)
                ? ((c as { flexible_schedule?: unknown[] }).flexible_schedule as unknown[])
                : [];
              const actualCalendar = Array.isArray((c as { actual_calendar?: unknown[] }).actual_calendar)
                ? ((c as { actual_calendar?: unknown[] }).actual_calendar as unknown[])
                : [];
              const schedule = Array.isArray((c as { schedule?: unknown[] }).schedule)
                ? ((c as { schedule?: unknown[] }).schedule as unknown[])
                : [];

              const flexWorkplace = flexibleSchedule[0] as Record<string, unknown> | undefined;
              const actualWorkplace = actualCalendar[0] as Record<string, unknown> | undefined;
              const scheduleWorkplace = schedule[0] as Record<string, unknown> | undefined;

              let subId =
                (c as { subsidiary_id?: string }).subsidiary_id ||
                (subsidiaryIds[0] as string) ||
                (flexWorkplace?.workplace as Record<string, unknown> | undefined)?.id ||
                (actualWorkplace?.workplace as Record<string, unknown> | undefined)?.id ||
                (scheduleWorkplace?.workplace as Record<string, unknown> | undefined)?.id ||
                (actualWorkplace?.subsidiary_id as string) ||
                "";

              let location =
                (c as { subsidiary_name?: string }).subsidiary_name ||
                (flexWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
                (actualWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
                (scheduleWorkplace?.workplace as Record<string, unknown> | undefined)?.label ||
                "";
              if (!location || location.toLowerCase() === "subsidiary") {
                if (subId && subsidiaryNameMap.has(subId)) location = subsidiaryNameMap.get(subId) || "";
              }

              const info = { shift: String(planned || "").trim(), location: String(location || "").trim() };
              if (contractId) plannedInfo[`${contractId}_${dayFromItem}`] = info;
              if (userId) plannedInfo[`${userId}_${dayFromItem}`] = info;
            }
          }
        }
      } catch (err) {
        if (debug) {
          const e = err as Error & { details?: unknown };
          calendarDebug = { error: e.details ?? e.message };
        }
      }
    }

    const plannedSubsidiaryErrors: Array<{ contractId?: string; day?: string; error?: unknown }> = [];
    if (includeCalendar) {
      for (const c of result as Array<Record<string, unknown>>) {
        const contractId = (c.contract_id as string) || (c.contractId as string) || (c.contract as string);
        if (!contractId) continue;
        const days = Array.isArray(c.days) ? (c.days as Array<Record<string, unknown>>) : [];
        for (const day of days) {
          const dayVal = (day.day as string) || (day.date as string) || date;
          const key = `${contractId}_${dayVal}`;
          if (plannedInfo[key]?.location) continue;

          let time = "09:00:00";
          let direction = "IN";
          const records = Array.isArray(day.clock_records) ? (day.clock_records as Array<Record<string, unknown>>) : [];
          if (records.length > 0) {
            const cr = records[0];
            if (cr.time) time = String(cr.time);
            else if (cr.server_clock_at) time = new Date(String(cr.server_clock_at)).toISOString().slice(11, 19);
            if (cr.direction) direction = String(cr.direction);
          }
          try {
            const ps = await fetchPlannedSubsidiary({
              contract_id: contractId,
              stamping_date: dayVal,
              stamping_time: time,
              direction,
            });
            let loc = "";
            const psAny = ps as Record<string, unknown>;
            if (psAny.subsidiary_name) loc = String(psAny.subsidiary_name);
            else if (psAny.name) loc = String(psAny.name);
            else if (psAny.subsidiary && (psAny.subsidiary as Record<string, unknown>).name) {
              loc = String((psAny.subsidiary as Record<string, unknown>).name);
            } else if (psAny.subsidiary && (psAny.subsidiary as Record<string, unknown>).label) {
              loc = String((psAny.subsidiary as Record<string, unknown>).label);
            }
            const shift = String((psAny.shift_name as string) || (psAny.shift as string) || "").trim();
            plannedInfo[key] = { shift, location: String(loc || "").trim() };
          } catch (err) {
            if (debug) {
              const e = err as Error & { details?: unknown };
              plannedSubsidiaryErrors.push({ contractId, day: dayVal, error: e.details ?? e.message });
            }
          }
        }
      }
    }

    const entriesOut: Array<Record<string, unknown>> = [];
    for (const c of result as Array<Record<string, unknown>>) {
      let personName =
        pickPersonName(c) ||
        pickPersonName((c.user as Record<string, unknown>) || null) ||
        pickPersonName((c.employee as Record<string, unknown>) || null) ||
        pickPersonName((c.person as Record<string, unknown>) || null) ||
        pickPersonName((c.worker as Record<string, unknown>) || null) ||
        "";
      const total = (c.total_duration as number) || (c.totalDuration as number) || 0;
      const contractId = (c.contract_id as string) || (c.contractId as string) || (c.contract as string) || "";
      const userId = (c.user_id as string) || (c.userId as string) || "";
      if (!personName && contractId && contractNameMap.has(contractId)) {
        personName = contractNameMap.get(contractId) || "";
      }
      if (!personName && userId && userIdNameMap.has(userId)) {
        personName = userIdNameMap.get(userId) || "";
      }
      const days = Array.isArray(c.days) ? (c.days as Array<Record<string, unknown>>) : [];
      if (days.length === 0) {
        entriesOut.push({
          contractId,
          personName,
          day: "",
          workedMinutes: 0,
          totalDurationMinutes: total,
          clockRecordsCount: 0,
          stampingLocations: [],
          plannedShift: "",
          plannedLocation: "",
        });
      } else {
        for (const d of days) {
          const dur = (d.duration as number) || (d.total_duration as number) || (d.duration_minutes as number) || 0;
          const records = Array.isArray(d.clock_records) ? (d.clock_records as Array<Record<string, unknown>>) : [];
          const count = records.length;
          const dayVal = (d.day as string) || (d.date as string) || date;
          const key = `${contractId || userId}_${dayVal}`;

          const locs = new Set<string>();
          let entryLoc = "";
          let exitLoc = "";
          let entryTime = "";
          let exitTime = "";
          let entryDeviceType = "";
          let exitDeviceType = "";
          for (const r of records) {
            let loc =
              pickLocationName(r) ||
              pickLocationName((r.subsidiary as Record<string, unknown>) || null) ||
              pickLocationName((r.location as Record<string, unknown>) || null) ||
              pickLocationName((r.site as Record<string, unknown>) || null) ||
              pickLocationName((r.workplace as Record<string, unknown>) || null) ||
              "";
            if (!loc) {
              const subId = (r.subsidiary_id as string) || (r.contract_subsidiary_id as string) || "";
              if (subId && subsidiaryNameMap.has(subId)) loc = subsidiaryNameMap.get(subId) || "";
            }
            if (loc) locs.add(String(loc));
            const dir = String(r.direction || "").toUpperCase();
            if (dir === "IN" && !entryLoc) {
              entryLoc = String(loc || "");
              entryTime = (r.time as string) || (r.server_clock_at as string) || "";
              entryDeviceType = (r.stamping_device_type as string) || (r.clock_type as string) || "";
            }
            if (dir === "OUT") {
              exitLoc = String(loc || "");
              exitTime = (r.time as string) || (r.server_clock_at as string) || "";
              exitDeviceType = (r.stamping_device_type as string) || (r.clock_type as string) || "";
            }
            if (!personName) {
              const fromRecord =
                pickPersonName(r) ||
                pickPersonName((r.user as Record<string, unknown>) || null) ||
                pickPersonName((r.employee as Record<string, unknown>) || null) ||
                pickPersonName((r.person as Record<string, unknown>) || null) ||
                "";
              personName = fromRecord || "";
            }
          }
          if (!personName && contractId && contractNameMap.has(contractId)) {
            personName = contractNameMap.get(contractId) || "";
          }
          if (!personName && userId && userIdNameMap.has(userId)) {
            personName = userIdNameMap.get(userId) || "";
          }

          const info = plannedInfo[key] || { shift: "", location: "" };
          entriesOut.push({
            contractId,
            personName,
            day: dayVal,
            workedMinutes: dur,
            totalDurationMinutes: total,
            clockRecordsCount: count,
            stampingLocations: Array.from(locs),
            entryLocation: entryLoc,
            entryTime,
            entryDeviceType,
            exitLocation: exitLoc,
            exitTime,
            exitDeviceType,
            plannedShift: info.shift || "",
            plannedLocation: info.location || "",
          });
        }
      }
    }

    entries = entriesOut;

    if (debug) {
      const rawSample = result[0] || null;
      const normalizedSample = entriesOut[0] || null;
      return NextResponse.json({
        date,
        rawSample,
        normalizedSample,
        contractSample,
        calendarDebug,
        plannedSubsidiaryErrors,
      });
    }
  }

  if (wantsJson) {
    return NextResponse.json({ date, items: entries });
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

  const rows = entries.map((row) => [
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
      "Content-Disposition": `attachment; filename=\"daily_summary_${date}.csv\"`,
    },
  });
}
