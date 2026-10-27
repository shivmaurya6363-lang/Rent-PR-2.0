import ProtectedRoute from "@/components/ProtectedRoute";
import VendorPayouts from "@/views/vendor/VendorPayouts";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']} requireApprovedVendor>
      <VendorPayouts />
    </ProtectedRoute>
  );
}
