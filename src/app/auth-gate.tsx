"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabaseClient";
import { AppShell } from "./app-shell";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseClient();

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session && pathname !== "/login") {
        router.replace("/login");
        return;
      }
      setReady(true);
    };

    check();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h2>Caricamento...</h2>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
