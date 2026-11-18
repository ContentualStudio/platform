import { redirect } from "next/navigation";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { getProfileServer } from "@/lib/server-profile";

export async function SettingsFrameLoader() {
  const profile = await getProfileServer();

  if (!profile) {
    redirect("/auth/sign");
  }

  return <SettingsFrame profile={profile} />;
}
