import { connection } from "next/server";

export async function getDashboardRenderTime(
  waitForRequest: () => Promise<void> = connection,
  readNow: () => Date = () => new Date(),
): Promise<Date> {
  await waitForRequest();
  return readNow();
}
