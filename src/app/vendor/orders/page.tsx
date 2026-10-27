import ProtectedRoute from "@/components/ProtectedRoute";
import VendorOrders from "@/views/vendor/VendorOrders";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']} requireApprovedVendor>
      <VendorOrders />
    </ProtectedRoute>
  );
}
