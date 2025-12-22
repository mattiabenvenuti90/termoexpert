import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(sites);
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const keywordsRaw = body.keywords;
  const keywords =
    Array.isArray(keywordsRaw)
      ? keywordsRaw.filter((kw: unknown) => typeof kw === "string" && kw.trim()).map((kw: string) => kw.trim())
      : typeof keywordsRaw === "string"
        ? keywordsRaw.split(",").map((kw) => kw.trim()).filter(Boolean)
        : [];

  const site = await prisma.site.create({
    data: {
      name,
      keywords,
    },
  });

  return NextResponse.json(site, { status: 201 });
}
