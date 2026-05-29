// src/components/AppShell.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User } from "@/lib/types";

interface Props {
  user: User;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  {
    href: "/voting",
    label: "투표",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/ranking",
    label: "랭킹",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/history",
    label: "정산내역",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const ADMIN_NAV = {
  href: "/admin",
  label: "관리",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

export default function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const navItems = user.role === "admin" ? [...NAV_ITEMS, ADMIN_NAV] : NAV_ITEMS;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <>
      <header className="app-header">
        <div className="app-logo">
          NBA<span>PICK</span>
        </div>
        <div className="user-badge">
          <span>{user.name}</span>
          <button className="logout-btn" onClick={handleLogout}>로그아웃</button>
        </div>
      </header>

      <main className="app-container">{children}</main>

      <nav className="bottom-nav">
        {navItems.map((item) => (
          <button
            key={item.href}
            className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
            onClick={() => router.push(item.href)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
