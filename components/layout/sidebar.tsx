"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface SidebarItem {
  label: string;
  href: string;
  icon: string;
  processFn?: string;
}

interface SidebarProps {
  items: SidebarItem[];
  title: string;
  subtitle: string;
  username: string;
  userRole: string;
  onLogout: () => void;
  notificationCount?: number;
  notificationHref?: string;
}

export function Sidebar({ items, title, subtitle, username, userRole, onLogout, notificationCount = 0, notificationHref }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed left-4 top-4 z-[60] flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a1a2e] text-white shadow-lg transition hover:bg-[#16213e] lg:hidden"
        aria-label="Toggle menu"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] shadow-2xl transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">SPC</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="truncate text-[10px] text-white/50">{subtitle}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 ${isActive ? "bg-white/15 text-white shadow-lg shadow-black/20" : "text-white/60 hover:bg-white/8 hover:text-white"}`}>
                    <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[11px] transition-all ${isActive ? "bg-white/20 text-white" : "bg-white/5 text-white/50 group-hover:bg-white/10 group-hover:text-white/80"}`}>{item.icon}</span>
                    <span className="min-w-0 leading-tight">{item.label}</span>
                    {item.processFn && <span className={`ml-auto flex-none rounded-md px-1 py-0.5 text-[8px] font-bold transition-all ${isActive ? "bg-white/20 text-white" : "bg-white/5 text-white/30 group-hover:bg-white/10 group-hover:text-white/50"}`}>{item.processFn}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">{username.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">@{username}</p>
              <p className="text-[10px] text-white/40">{userRole}</p>
            </div>
            {notificationHref && (
              <Link href={notificationHref} className="relative flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-all hover:bg-white/10 hover:text-white" title="Notifications">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">{notificationCount > 99 ? "99+" : notificationCount}</span>
                )}
              </Link>
            )}
            <button onClick={onLogout} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-all hover:bg-white/10 hover:text-white" title="Log out">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
