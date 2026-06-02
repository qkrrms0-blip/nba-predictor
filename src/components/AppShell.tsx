// src/components/AppShell.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@/lib/types";

const VAPID_PUBLIC_KEY = "BKL6UKrrJZ7gSC6PF2jmAF7E0NWMGnMlv4w5omFMm_U0rNBOPE7RX-p24CjjblYc9ns_Ndo1tQxpO2hTD6OPKnM";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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
  // ✅ 브라우저 권한과 실제 구독 여부를 분리
  const [notifPermission, setNotifPermission] = useState<string>("default");
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    const permission = Notification.permission;
    setNotifPermission(permission);

    // ✅ 권한이 granted일 때만 실제 구독 여부를 확인
    if (permission === "granted") {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const requestPushPermission = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission !== "granted") return;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      setIsSubscribed(true);
      return;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });

    const { endpoint, keys } = subscription.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
    });

    // ✅ 구독 성공 시 구독 상태만 변경 (브라우저 권한은 그대로 "granted")
    setIsSubscribed(true);
  };

  const cancelPushPermission = async () => {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    // ✅ 구독 해제 시 notifPermission은 건드리지 않고 isSubscribed만 false로
    setIsSubscribed(false);
  };

  const navItems = user.role === "admin" ? [...NAV_ITEMS, ADMIN_NAV] : NAV_ITEMS;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // ✅ 버튼 표시 로직:
  //   - 권한 미결정(default) → "🔔 알림" 버튼
  //   - 권한 허용(granted) + 미구독 → "🔔 알림" 버튼 (구독 재등록)
  //   - 권한 허용(granted) + 구독 중 → "🔕 알림끄기" 버튼
  const showSubscribeBtn =
    notifPermission === "default" ||
    (notifPermission === "granted" && !isSubscribed);
  const showUnsubscribeBtn = notifPermission === "granted" && isSubscribed;

  return (
    <>
      <header className="app-header">
        <div className="app-logo">
          NBA<span>ONESHOT</span>
        </div>
        <div className="user-badge">
          <span>{user.name}</span>
          {"Notification" in (typeof window !== "undefined" ? window : {}) && (
            <>
              {showSubscribeBtn && (
                <button
                  onClick={requestPushPermission}
                  style={{
                    background: "rgba(247,80,27,0.15)", border: "1px solid rgba(247,80,27,0.4)",
                    color: "var(--accent)", padding: "4px 10px", borderRadius: 20,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
                  }}>
                  🔔 알림
                </button>
              )}
              {showUnsubscribeBtn && (
                <button
                  onClick={cancelPushPermission}
                  style={{
                    background: "rgba(100,100,100,0.15)", border: "1px solid rgba(100,100,100,0.3)",
                    color: "var(--text-muted)", padding: "4px 10px", borderRadius: 20,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
                  }}>
                  🔕 알림끄기
                </button>
              )}
            </>
          )}
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