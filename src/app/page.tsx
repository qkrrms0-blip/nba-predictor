// src/app/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 디버그 추가
  console.log("USER ID:", user.id);

  const { data: profile, error } = await supabase
    .from("users")
    .select("approved, role")
    .eq("id", user.id)
    .single();

  // 디버그 추가
  console.log("PROFILE:", profile);
  console.log("ERROR:", error);

  if (!profile?.approved) redirect("/pending");
  redirect("/voting");
}