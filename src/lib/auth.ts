import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type AuthResult =
  | { ok: true; supabaseUrl: string; supabaseKey: string; userId: string }
  | { ok: false; response: NextResponse };

export async function requireUser(request: NextRequest): Promise<AuthResult> {
  if (process.env.AUTH_DISABLED === "1") {
    return {
      ok: true,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      userId: "dev-user",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Supabase env not configured" },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, supabaseUrl, supabaseKey, userId: data.user.id };
}
