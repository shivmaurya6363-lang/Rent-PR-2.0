import "server-only";
import { cookies } from "next/headers";
import { resolvePincode } from "./catalog";

/** The visitor's chosen, serviceable PIN code and its city, read from the cookie set by the PIN dialog. */
export async function getSelectedPin(): Promise<{ pin: string; location: { id: string; name: string; slug: string } } | null> {
  const pin = cookies().get("rentpr_pin")?.value;
  if (!pin || !/^[1-9][0-9]{5}$/.test(pin)) return null;
  const location = await resolvePincode(pin);
  return location ? { pin, location } : null;
}
