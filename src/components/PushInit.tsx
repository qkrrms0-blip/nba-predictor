"use client";
// src/components/PushInit.tsx
import { useEffect } from "react";

const VAPID_PUBLIC_KEY = "BKL6UKrrJZ7gSC6PF2jmAF7E0NWMGnMlv4w5omFMm_U0rNBOPE7RX-p24CjjblYc9ns_Ndo1tQxpO2hTD6OPKnM";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export default function PushInit() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const init = async () => {
      try {
        // 서비스워커 등록
        const reg = await navigator.serviceWorker.register("/sw.js");

        // 알림 권한 확인 — 이미 허용된 경우만 자동 구독
        // 거부된 경우 무시, 아직 안 물어본 경우 무시 (AppShell에서 버튼으로 요청)
        if (Notification.permission !== "granted") return;

        // 이미 구독 있는지 확인
        const existing = await reg.pushManager.getSubscription();
        if (existing) return; // 이미 구독됨

        // 구독 생성
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
      } catch {
        // 무시
      }
    };

    init();
  }, []);

  return null;
}
