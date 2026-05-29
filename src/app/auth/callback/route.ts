import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code);

    if (user) {
      // public.users에 없으면 추가
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!existing) {
        // invited_emails에 있는지 확인
        const { data: invited } = await supabase
          .from("invited_emails")
          .select("name")
          .eq("email", user.email)
          .single();

        await supabase.from("users").insert({
          id: user.id,
          email: user.email,
          name: invited?.name || user.user_metadata?.full_name || user.email,
          approved: !!invited,
        });
      }
    }
  }

  return NextResponse.redirect(`${origin}/`);
}