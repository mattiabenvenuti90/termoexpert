import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateMockDailySummary } from "@/lib/mock";
import { toCsvRows } from "@/lib/csv";
import { fetchCalendarSummary, fetchContracts, fetchDailyClockRecords, fetchPlannedSubsidiary } from "@/lib/fluida";

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

  let entries: Array<Record<string, unknown>> = [];
  if (useMock) {
    entries = generateMockDailySummary(date, 25);
  } else {
    let result: Array<Record<string, unknown>> = [];
    const data = await fetchDailyClockRecords({ date });
    if (Array.isArray(data)) result = data;
    else if (data && (data as { data?: unknown }).data) result = (data as { data?: unknown }).data as Array<Record<string, unknown>>;
    else if (data && (data as { items?: unknown }).items) result = (data as { items?: unknown }).items as Array<Record<string, unknown>>;
    else if (data) result = data as Array<Record<string, unknown>>;

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "Nessun dato trovato" }, { status: 404 });
    }

    const contractNameMap = new Map<string, string>();
    const needsContractNames = result.some((c) => {
      const name =
        (c.user_name as string) ||
        (c.user_full_name as string) ||
        (c.user as string) ||
        (c.employee_name as string) ||
        (c.employee_full_name as string) ||
        (c.employee as string) ||
        (c.contract_name as string) ||
        (c.name as string) ||
        "";
      const contractId = (c.contract_id as string) || (c.contractId as string) || (c.contract as string) || "";
      return !name && !!contractId;
    });

    if (needsContractNames) {
      try {
        const contracts = await fetchContracts({ page_size: 200 });
        for (const it of contracts as Array<Record<string, unknown>>) {
          const id = (it.id as string) || (it.contract_id as string) || (it.contractId as string) || "";
          if (!id) continue;
          const fn = (it.first_name as string) || (it.firstname as string) || (it.user_firstname as string) || (it.user_first_name as string) || "";
          const ln = (it.last_name as string) || (it.lastname as string) || (it.user_lastname as string) || (it.user_last_name as string) || "";
          const full = `${fn} ${ln}`.trim();
          const fallback = (it.name as string) || (it.surname as string) || "";
          contractNameMap.set(id, full || fallback);
        }
      } catch {
        // ignore contract lookup failures
      }
    }

    let plannedInfo: Record<string, { shift: string; location: string }> = {};
    if (includeCalendar) {
      try {
        const cal = await fetchCalendarSummary({ date });
        let calItems = Array.isArray(cal) ? cal : (cal as { data?: unknown }).data ?? (cal as { items?: unknown }).items ?? cal;
        if (Array.isArray(calItems)) {
          for (const c of calItems) {
            const contractId = (c as { contract_id?: string; contractId?: string; contract?: string }).contract_id
              || (c as { contractId?: string }).contractId
              || (c as { contract?: string }).contract
              || null;
            const days = Array.isArray((c as { days?: unknown[] }).days) ? (c as { days?: unknown[] }).days : [];
            if (!contractId) continue;
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
              const location =
                (d.subsidiary_name as string) ||
                (d.location as string) ||
                (d.site_name as string) ||
                (d.site as string) ||
                (d.location_name as string) ||
                (d.workplace as string) ||
                (d.place as string) ||
                (d.location_description as string) ||
                "";
              plannedInfo[`${contractId}_${dayVal}`] = {
                shift: String(planned || "").trim(),
                location: String(location || "").trim(),
              };
            }
          }
        }
      } catch {
        // ignore calendar failures
      }
    }

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
            } else if (psAny.subsidiary_id) {
              loc = String(psAny.subsidiary_id);
            }
            const shift = String((psAny.shift_name as string) || (psAny.shift as string) || "").trim();
            plannedInfo[key] = { shift, location: String(loc || "").trim() };
          } catch {
            // ignore per-contract errors
          }
        }
      }
    }

    const entriesOut: Array<Record<string, unknown>> = [];
    for (const c of result as Array<Record<string, unknown>>) {
      let personName =
        (c.user_name as string) ||
        (c.user_full_name as string) ||
        (c.user as string) ||
        (c.employee_name as string) ||
        (c.employee_full_name as string) ||
        (c.employee as string) ||
        (c.contract_name as string) ||
        (c.name as string) ||
        "";
      const total = (c.total_duration as number) || (c.totalDuration as number) || 0;
      const contractId = (c.contract_id as string) || (c.contractId as string) || (c.contract as string) || "";
      if (!personName && contractId && contractNameMap.has(contractId)) {
        personName = contractNameMap.get(contractId) || "";
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
          const key = `${contractId}_${dayVal}`;

          const locs = new Set<string>();
          let entryLoc = "";
          let exitLoc = "";
          let entryTime = "";
          let exitTime = "";
          for (const r of records) {
            const loc =
              (r.subsidiary_name as string) ||
              (r.location as string) ||
              (r.site_name as string) ||
              (r.site as string) ||
              (r.location_name as string) ||
              (r.workplace as string) ||
              (r.place as string) ||
              (r.subsidiary_id as string) ||
              "";
            if (loc) locs.add(String(loc));
            const dir = String(r.direction || "").toUpperCase();
            if (dir === "IN" && !entryLoc) {
              entryLoc = String(loc || "");
              entryTime = (r.time as string) || (r.server_clock_at as string) || "";
            }
            if (dir === "OUT") {
              exitLoc = String(loc || "");
              exitTime = (r.time as string) || (r.server_clock_at as string) || "";
            }
            if (!personName) {
              const fn = (r.user_firstname as string) || (r.user_first_name as string) || (r.first_name as string) || (r.firstname as string) || "";
              const ln = (r.user_lastname as string) || (r.user_last_name as string) || (r.last_name as string) || (r.lastname as string) || "";
              const full = `${fn} ${ln}`.trim();
              personName = full || (r.user as string) || (r.user_name as string) || "";
            }
          }
          if (!personName && contractId && contractNameMap.has(contractId)) {
            personName = contractNameMap.get(contractId) || "";
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
            exitLocation: exitLoc,
            exitTime,
            plannedShift: info.shift || "",
            plannedLocation: info.location || "",
          });
        }
      }
    }

    entries = entriesOut;
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
