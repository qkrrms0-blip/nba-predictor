// src/app/pending/page.tsx
"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function PendingPage() {
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="pending-page">
      <div className="pending-card">
        <div className="pending-icon">⏳</div>
        <h1 className="pending-title">승인 대기 중</h1>
        <p className="pending-desc">
          관리자가 계정을 검토 중입니다.<br />
          승인 후 투표에 참여할 수 있습니다.<br /><br />
          문의: 관리자에게 연락하세요.
        </p>
        <button
          className="btn-primary"
          style={{ marginTop: 24, width: "100%" }}
          onClick={handleLogout}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
