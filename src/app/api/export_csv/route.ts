import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateMockExports } from "@/lib/mock";
import { fetchExports } from "@/lib/fluida";
import { toCsvRows } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const useMock = searchParams.get("mock") === "1" || searchParams.get("mock") === "true";
  const count = Number.parseInt(searchParams.get("count") ?? "50", 10);
  const fromDate = searchParams.get("from_date");
  const toDate = searchParams.get("to_date");

  let items: Array<Record<string, unknown> & { id: string }> = [];
  if (useMock) {
    items = generateMockExports(count);
  } else {
    try {
      items = await fetchExports({ count, from_date: fromDate, to_date: toDate });
    } catch (err) {
      const details = (err as { details?: unknown }).details;
      return new Response(
        JSON.stringify({ error: "Fluida upstream error", details: details ?? (err as Error).message }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const sites = await prisma.site.findMany();
  const associations = await prisma.association.findMany();
  const assocMap = new Map(associations.map((a) => [a.recordId, a.siteId]));
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  const enriched = items.map((item) => {
    const assoc = assocMap.get(item.id);
    if (assoc) {
      return { ...item, siteId: assoc, siteName: siteMap.get(assoc) ?? null };
    }
    return { ...item, siteId: null, siteName: null };
  });

  const filtered = enriched.filter((item) => {
    if (!fromDate && !toDate) return true;
    const dateValue = typeof item.date === "string" ? item.date.slice(0, 10) : "";
    if (fromDate && dateValue < fromDate) return false;
    if (toDate && dateValue > toDate) return false;
    return true;
  });

  if (!filtered.length) {
    return new Response(JSON.stringify({ error: "Nessun record" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const keys = Object.keys(filtered[0]);
  const rows = filtered.map((row) => keys.map((key) => row[key] as string | number | null | undefined));
  const csv = toCsvRows(keys, rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"timbrature.csv\"",
    },
  });
}
