"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createSupabaseClient } from "@/lib/supabaseClient";

type ShellContextValue = {
  mock: boolean;
  setMock: (value: boolean) => void;
  organizationId: string;
  organizationStatus: "idle" | "loading" | "ready" | "error";
  organizationError: string | null;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used inside AppShell");
  }
  return ctx;
}

const navItems = [
  { href: "/", label: "Home / Panoramica" },
  { href: "/exports", label: "Timbrature" },
  { href: "/daily", label: "Riepilogo giornaliero" },
  { href: "/contracts", label: "Contratti" },
  { href: "/fluida-sync", label: "Sync Fluida" },
  { href: "/fluida-sync/settings", label: "Impostazioni Sync" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgFromQuery = searchParams.get("organizationId");
  const [mock, setMock] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("fluidaMock") === "1";
  });
  const [organizationId, setOrganizationId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("fluidaOrganizationId") ?? "";
  });
  const [organizationStatus, setOrganizationStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [organizationError, setOrganizationError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("fluidaMock", mock ? "1" : "0");
  }, [mock]);

  const getAccessToken = async () => {
    if (typeof window === "undefined") return null;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;
    try {
      const host = new URL(supabaseUrl).hostname;
      const projectRef = host.split(".")[0];
      const key = `sb-${projectRef}-auth-token`;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      }
    } catch {
      // ignore localStorage parsing issues
    }
    try {
      const supabase = createSupabaseClient();
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (orgFromQuery) {
      setOrganizationId(orgFromQuery);
      setOrganizationStatus("ready");
      setOrganizationError(null);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("fluidaOrganizationId", orgFromQuery);
      }
    }
  }, [orgFromQuery]);

  useEffect(() => {
    if (!organizationId) return;
    if (organizationStatus === "idle") {
      setOrganizationStatus("ready");
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("fluidaOrganizationId", organizationId);
    }
  }, [organizationId, organizationStatus]);

  useEffect(() => {
    if (orgFromQuery || organizationId) return;
    let ignore = false;
    const load = async () => {
      setOrganizationStatus("loading");
      setOrganizationError(null);
      const token = await getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch("/api/organization/current", { headers, signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) {
          if (res.status === 404) {
            const boot = await fetch("/api/bootstrap", {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            if (boot.ok) {
              const retry = await fetch("/api/organization/current", { headers });
              if (retry.ok) {
                const json = (await retry.json()) as { organizationId?: string };
                if (!ignore && json.organizationId) {
                  setOrganizationId(json.organizationId);
                  setOrganizationStatus("ready");
                  if (typeof window !== "undefined") {
                    const params = new URLSearchParams(window.location.search);
                    params.set("organizationId", json.organizationId);
                    const next = `${pathname}?${params.toString()}`;
                    router.replace(next);
                  }
                  return;
                }
              }
            }
          }
          if (ignore) return;
          const text = await res.text().catch(() => "");
          if (ignore) return;
          const cached = typeof window !== "undefined" ? window.localStorage.getItem("fluidaOrganizationId") : "";
          if (cached) {
            setOrganizationId(cached);
            setOrganizationStatus("ready");
            setOrganizationError(
              text || `Recupero organizationId non riuscito, usata la cache locale (errore ${res.status}).`
            );
            return;
          }
          setOrganizationStatus("error");
          setOrganizationError(text || `Errore ${res.status} nel recupero organizationId`);
          return;
        }
        const json = (await res.json()) as { organizationId?: string };
        if (ignore) return;
        if (!json.organizationId) {
          setOrganizationStatus("error");
          setOrganizationError("Organization non trovata.");
          return;
        }
        setOrganizationId(json.organizationId);
        setOrganizationStatus("ready");
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          params.set("organizationId", json.organizationId);
          const next = `${pathname}?${params.toString()}`;
          router.replace(next);
        }
      } catch (err) {
        clearTimeout(timer);
        if (ignore) return;
        const message =
          err instanceof Error && err.name === "AbortError"
            ? "Timeout nel recupero organizationId."
            : err instanceof Error
            ? err.message
            : "Errore nel recupero organizationId.";
        const cached = typeof window !== "undefined" ? window.localStorage.getItem("fluidaOrganizationId") : "";
        if (cached) {
          setOrganizationId(cached);
          setOrganizationStatus("ready");
          setOrganizationError(`${message} Usata la cache locale.`);
          return;
        }
        setOrganizationStatus("error");
        setOrganizationError(message);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [orgFromQuery, organizationId, pathname, router]);

  const value = useMemo(
    () => ({ mock, setMock, organizationId, organizationStatus, organizationError }),
    [mock, organizationId, organizationStatus, organizationError]
  );

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href;
  };

  const withOrg = (href: string) => {
    if (!organizationId) return href;
    const hasQuery = href.includes("?");
    const param = `organizationId=${encodeURIComponent(organizationId)}`;
    if (hasQuery) return `${href}&${param}`;
    return `${href}?${param}`;
  };

  return (
    <ShellContext.Provider value={value}>
      <div className="layout">
        <nav className="sidebar">
          <div className="brand">Fluida mini portale</div>
          <div className="nav-group">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={withOrg(item.href)}
                className={isActive(item.href) ? "active" : ""}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="meta">
            <div>API base</div>
            <code>/api</code>
            <label className="inline">
              <input
                type="checkbox"
                checked={mock}
                onChange={(event) => setMock(event.target.checked)}
              />{" "}
              Usa mock
            </label>
          </div>
        </nav>
        <main className="content">{children}</main>
      </div>
    </ShellContext.Provider>
  );
}
