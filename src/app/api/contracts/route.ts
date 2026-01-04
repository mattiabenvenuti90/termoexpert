import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateMockContracts } from "@/lib/mock";
import { fetchContracts } from "@/lib/fluida";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const useMock = searchParams.get("mock") === "1" || searchParams.get("mock") === "true";
  const debug = searchParams.get("debug") === "1" || searchParams.get("debug") === "true";

  if (useMock) {
    return NextResponse.json(generateMockContracts());
  }
  try {
    const items = await fetchContracts({ page_size: 200 });
    const normalized = (items || []).map((it: Record<string, unknown>) => ({
      id: (it.id as string) || (it.contract_id as string) || (it.contractId as string) || "",
      first_name:
        (it.first_name as string) ||
        (it.firstname as string) ||
        (it.user_firstname as string) ||
        (it.user_first_name as string) ||
        (it.name as string) ||
        "",
      last_name:
        (it.last_name as string) ||
        (it.lastname as string) ||
        (it.user_lastname as string) ||
        (it.user_last_name as string) ||
        (it.surname as string) ||
        "",
      email: (it.email as string) || (it.user_email as string) || "",
      raw: it,
    }));
    return NextResponse.json(normalized);
  } catch (err) {
    const e = err as Error & { details?: unknown };
    return NextResponse.json(
      debug ? { error: e.message, details: e.details ?? null } : { error: e.message },
      { status: 500 }
    );
  }
}
