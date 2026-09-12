"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function updateProfile(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const usernameRaw = String(formData.get("username") ?? "").trim();
  const username = usernameRaw ? usernameRaw.replace(/^@/, "").toLowerCase() : null;

  if (username && !/^[a-z0-9_]{3,20}$/.test(username)) {
    redirect(
      `/profile?error=${encodeURIComponent(
        "Username must be 3-20 characters: letters, numbers or underscores"
      )}`
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null, username })
    .eq("id", user.id);

  if (error) {
    const message = error.code === "23505" ? "That username is already taken" : error.message;
    redirect(`/profile?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/profile");
  revalidatePath("/settings");
}

export async function uploadAvatar(formData: FormData) {
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    redirect(`/profile?error=${encodeURIComponent("Choose an image first")}`);
  }
  if (file.size > MAX_AVATAR_BYTES) {
    redirect(`/profile?error=${encodeURIComponent("Images must be 3 MB or smaller")}`);
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    redirect(`/profile?error=${encodeURIComponent("Use a JPEG, PNG, WebP or GIF image")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  // Storage policy only allows writes inside a folder named after the user id.
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });

  if (uploadError) {
    redirect(`/profile?error=${encodeURIComponent(uploadError.message)}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);

  revalidatePath("/profile");
  revalidatePath("/friends");
}

export async function removeAvatar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  revalidatePath("/profile");
}
