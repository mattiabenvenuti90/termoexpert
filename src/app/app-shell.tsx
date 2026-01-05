"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ShellContextValue = {
  mock: boolean;
  setMock: (value: boolean) => void;
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
  const [mock, setMock] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("fluidaMock") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("fluidaMock", mock ? "1" : "0");
  }, [mock]);

  const value = useMemo(() => ({ mock, setMock }), [mock]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href;
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
                href={item.href}
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
