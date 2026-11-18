import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { getProfileServer } from "@/lib/server-profile";

/**
 * Streams the persistent header once the profile resolves. `getProfileServer`
 * is `cache()`d per request, so sharing it with the profile gate and the page
 * below costs one api call, not three.
 */
export async function ProfileHeader() {
  const profile = await getProfileServer();

  if (!profile) {
    return null;
  }

  return <DashboardHeader profile={profile} />;
}
