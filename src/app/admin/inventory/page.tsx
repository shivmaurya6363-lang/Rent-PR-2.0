import ProtectedRoute from "@/components/ProtectedRoute";
import InventoryAdmin from "@/components/admin/rentals/InventoryAdmin";

export const metadata = { title: "Inventory | Admin", robots: { index: false } };

export default function Page() {
  return <ProtectedRoute requiredRoles={["admin"]}><InventoryAdmin /></ProtectedRoute>;
}
