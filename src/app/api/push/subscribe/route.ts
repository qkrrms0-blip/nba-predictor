// src/app/api/push/subscribe/route.ts
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint, p256dh, auth } = await request.json();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "구독 정보 없음" }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint, p256dh, auth, no_weekend: false },
      { onConflict: "user_id,endpoint" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await request.json();
  const adminSupabase = createAdminClient();
  await adminSupabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  return NextResponse.json({ success: true });
}

// 주말 알림 설정 ON/OFF
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekend } = await request.json();
  if (typeof weekend !== "boolean") {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("push_subscriptions")
    .update({ no_weekend: !weekend })
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}