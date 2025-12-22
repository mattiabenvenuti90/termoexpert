import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type SettingsPayload = {
  columnOrder?: string[];
  columnVisibility?: Record<string, boolean>;
};

export async function GET(request: NextRequest, context: { params: { tableKey: string } }) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const tableKey = context.params.tableKey;
  const settings = await prisma.tableSetting.findUnique({
    where: { userId_tableKey: { userId: auth.userId, tableKey } },
  });

  return NextResponse.json(
    settings
      ? {
          tableKey,
          columnOrder: settings.columnOrder,
          columnVisibility: settings.columnVisibility ?? {},
        }
      : { tableKey, columnOrder: [], columnVisibility: {} }
  );
}

export async function POST(
  request: NextRequest,
  context: { params: { tableKey: string } }
) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const tableKey = context.params.tableKey;
  const body = (await request.json().catch(() => ({}))) as SettingsPayload;
  const columnOrder = Array.isArray(body.columnOrder) ? body.columnOrder : [];
  const columnVisibility = body.columnVisibility ?? {};

  const settings = await prisma.tableSetting.upsert({
    where: { userId_tableKey: { userId: auth.userId, tableKey } },
    update: { columnOrder, columnVisibility },
    create: { userId: auth.userId, tableKey, columnOrder, columnVisibility },
  });

  return NextResponse.json({
    tableKey,
    columnOrder: settings.columnOrder,
    columnVisibility: settings.columnVisibility ?? {},
  });
}
