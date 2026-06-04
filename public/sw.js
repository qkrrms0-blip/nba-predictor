// public/sw.js

self.addEventListener("push", (event) => {
  // data 없어도 기본 알림 표시
  const title = "🏀 원샷 NBA";
  const options = {
    body: "오늘 투표하셨나요?",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: "/voting" },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/voting";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
