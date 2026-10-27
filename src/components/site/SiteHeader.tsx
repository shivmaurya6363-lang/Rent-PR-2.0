import { getCategoryTree } from "@/server/catalog";
import HeaderShell from "./HeaderShell";

/** Server wrapper: categories are rendered into the HTML, so the navigation is visible before JavaScript loads. */
export default async function SiteHeader() {
  const categories = await getCategoryTree().catch(() => []);
  return <HeaderShell categories={categories} />;
}
