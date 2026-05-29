// src/app/admin/layout.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { User } from "@/lib/types";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/voting");

  return <AppShell user={profile as User}>{children}</AppShell>;
}
