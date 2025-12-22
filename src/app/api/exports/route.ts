import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateMockExports } from "@/lib/mock";
import { fetchExports } from "@/lib/fluida";

function autoMatchSite(item: Record<string, unknown>, sites: Array<{ id: string; keywords: string[] }>) {
  const text = `${item.location ?? ""} ${item.note ?? ""} ${item.user ?? ""}`.toLowerCase();
  for (const site of sites) {
    if (!site.keywords?.length) continue;
    for (const kw of site.keywords) {
      if (!kw) continue;
      if (text.includes(kw.toLowerCase())) return site.id;
    }
  }
  return null;
}

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
      if (details) {
        return NextResponse.json({ error: "Fluida upstream error", details }, { status: 502 });
      }
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
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
    const matched = autoMatchSite(item, sites);
    if (matched) {
      return { ...item, siteId: matched, siteName: siteMap.get(matched) ?? null };
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

  return NextResponse.json(filtered);
}
