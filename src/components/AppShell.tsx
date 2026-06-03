// src/components/AppShell.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@/lib/types";

const VAPID_PUBLIC_KEY = "BJhwbTrxVeIRKCLhVqBi2CrW3-bA8jdoFRcTmWDEBJJej_kiNHj6lU0bScJwBqrIKBradCRNHk4lIWEWK5893Gk";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
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
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/ranking",
    label: "랭킹",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "정산내역",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const ADMIN_NAV = {
  href: "/admin",
  label: "관리",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// 토글 스타일 (인라인)
const togBase: React.CSSProperties = {
  position: "relative",
  width: 28,
  height: 15,
  borderRadius: 8,
  cursor: "pointer",
  flexShrink: 0,
  border: "1px solid",
  display: "inline-block",
};
const togOn: React.CSSProperties  = { ...togBase, background: "rgba(34,197,94,0.25)",  borderColor: "#4ade80" };
const togOff: React.CSSProperties = { ...togBase, background: "rgba(239,68,68,0.2)",   borderColor: "#f87171" };
const thumbOn: React.CSSProperties  = { position: "absolute", top: 1.5, left: 1.5,  width: 10, height: 10, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 4px rgba(74,222,128,0.8)",  transition: "left 0.2s" };
const thumbOff: React.CSSProperties = { position: "absolute", top: 1.5, left: 15,   width: 10, height: 10, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 4px rgba(248,113,113,0.8)", transition: "left 0.2s" };

export default function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();

  // ── 구독 상태 ──────────────────────────────────────────
  // 브라우저 알림 권한과 실제 Push 구독 여부를 분리해서 관리
  const [notifPermission, setNotifPermission] = useState<string>("default");
  const [isSubscribed, setIsSubscribed]       = useState<boolean>(false);

  // ── 주말 알림 설정 ─────────────────────────────────────
  const [weekendOn, setWeekendOn] = useState<boolean>(false);

  // ── 팝업 열림 상태 ─────────────────────────────────────
  const [popupOpen, setPopupOpen] = useState<boolean>(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const nameRef  = useRef<HTMLSpanElement>(null);

  // 랜덤 자동투표 설정
  const [randomAutoVote, setRandomAutoVote] = useState<boolean>(false);

  // 배당 자동투표 설정 (랜덤 ON일 때만 활성)
  const [oddsAutoVote, setOddsAutoVote] = useState<boolean>(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    // 서비스워커 등록
    navigator.serviceWorker.register("/sw.js").catch((err) =>
      console.error("SW 등록 실패:", err)
    );

    const permission = Notification.permission;
    setNotifPermission(permission);
    if (permission === "granted") {
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((sub) => setIsSubscribed(!!sub))
      );
    }
  }, []);

  // 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!popupOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        nameRef.current  && !nameRef.current.contains(e.target as Node)
      ) {
        setPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popupOpen]);

  // 알림 ON (구독 등록)
  const subscribe = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission !== "granted") return;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) { setIsSubscribed(true); return; }

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

    setIsSubscribed(true);
  };

  // 알림 OFF (구독 해제)
  const unsubscribe = async () => {
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
    setIsSubscribed(false);
    setWeekendOn(false);
    setRandomAutoVote(false);
    setOddsAutoVote(false);
  };

  // 주말 알림 토글 → DB 저장
  const toggleWeekend = async () => {
    const next = !weekendOn;
    setWeekendOn(next);
    await fetch("/api/push/subscribe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekend: next }),
    });
  };

  // 랜덤 자동투표 토글 → DB 저장
  const toggleRandomAutoVote = async () => {
    const next = !randomAutoVote;
    setRandomAutoVote(next);
    await fetch("/api/push/subscribe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ random: next }),
    });
  };

  // 배당 자동투표 토글 → DB 저장 (랜덤 OFF시 같이 비활성)
  const toggleOddsAutoVote = async () => {
    if (!randomAutoVote) return;
    const next = !oddsAutoVote;
    setOddsAutoVote(next);
    /* 배당 기능 활성화 시 아래 주석 해제
    await fetch("/api/push/subscribe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odds: next }),
    });
    */
  };

  const navItems    = user.role === "admin" ? [...NAV_ITEMS, ADMIN_NAV] : NAV_ITEMS;
  const handleLogout = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  const supportsNotif = typeof window !== "undefined" && "Notification" in window;

  return (
    <>
      <header className="app-header">
        <div className="app-logo">NBA<span>ONESHOT</span></div>

        <div className="user-badge" style={{ position: "relative" }}>

          {/* 이름 클릭 → 설정 팝업 */}
          <span
            ref={nameRef}
            onClick={() => setPopupOpen((v) => !v)}
            style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}
          >
            {user.name}
          </span>

          {/* 설정 팝업 */}
          {popupOpen && (
            <div
              ref={popupRef}
              style={{
                position: "fixed",
                top: 52,
                right: 12,
                background: "transparent",
                border: "1px solid #2e2e2e",
                borderRadius: 10,
                zIndex: 1000,
                whiteSpace: "nowrap",
                animation: "popIn 0.18s ease",
                backdropFilter: "blur(2px)",
              }}
            >
              <style>{`@keyframes popIn { from { transform:scale(0.92); opacity:0 } to { transform:scale(1); opacity:1 } }`}</style>

              {/* 팝업 헤더 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px 6px", borderBottom: "1px solid #2a2a2a", gap: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#bbb" }}>설정</span>
                <button
                  onClick={() => setPopupOpen(false)}
                  style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(42,42,42,0.7)", border: "none", cursor: "pointer", color: "#777", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
                >✕</button>
              </div>

              {/* 토글 그리드: 2행 (알림·주말 / 랜덤·배당) */}
              {supportsNotif && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", padding: "6px 10px 8px", background: "#1c1c1c" }}>

                  {/* 1행 좌: 알림 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px 4px 0", borderRight: "1px solid #2a2a2a", borderBottom: "1px solid #2a2a2a" }}>
                    <span style={{ fontSize: 11, color: "#888" }}>알림</span>
                    <div style={isSubscribed ? togOn : togOff} onClick={isSubscribed ? unsubscribe : subscribe}>
                      <div style={isSubscribed ? thumbOn : thumbOff} />
                    </div>
                  </div>

                  {/* 1행 우: 주말 (알림 OFF면 비활성) */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 0 4px 8px", borderBottom: "1px solid #2a2a2a", opacity: isSubscribed ? 1 : 0.35 }}>
                    <span style={{ fontSize: 11, color: "#888" }}>주말</span>
                    <div
                      style={{ ...(weekendOn ? togOn : togOff), pointerEvents: isSubscribed ? "auto" : "none" }}
                      onClick={isSubscribed ? toggleWeekend : undefined}
                    >
                      <div style={weekendOn ? thumbOn : thumbOff} />
                    </div>
                  </div>

                  {/* 2행 좌: 랜덤 (알림과 독립) */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 6px 2px 0", borderRight: "1px solid #2a2a2a" }}>
                    <span style={{ fontSize: 11, color: "#888" }}>랜덤</span>
                    <div
                      style={{ ...(randomAutoVote ? togOn : togOff) }}
                      onClick={toggleRandomAutoVote}
                    >
                      <div style={randomAutoVote ? thumbOn : thumbOff} />
                    </div>
                  </div>

                  {/* 2행 우: 배당
                      랜덤 ON → 흐리게 표시(opacity 0.6), OFF → 더 흐리게(0.25)
                      ── 배당 기능 활성화 방법 ──────────────────────────────
                      1) 아래 DISABLED_START ~ DISABLED_END 블록을 삭제
                      2) ENABLED_START ~ ENABLED_END 블록의 주석 기호(//)를 제거
                      ─────────────────────────────────────────────────── */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 0 2px 8px", opacity: randomAutoVote ? 0.6 : 0.25 }}>
                    <span style={{ fontSize: 11, color: "#888" }}>배당</span>
                    {/* DISABLED_START */}
                    <div style={{ ...togOff, pointerEvents: "none" }}>
                      <div style={thumbOff} />
                    </div>
                    {/* DISABLED_END */}
                    {/* ENABLED_START
                    <div
                      style={{ ...(oddsAutoVote ? togOn : togOff), pointerEvents: randomAutoVote ? "auto" : "none" }}
                      onClick={randomAutoVote ? toggleOddsAutoVote : undefined}
                    >
                      <div style={oddsAutoVote ? thumbOn : thumbOff} />
                    </div>
                    ENABLED_END */}
                  </div>

                </div>
              )}
            </div>
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