import ProtectedRoute from "@/components/ProtectedRoute";
import VendorProductView from "@/views/vendor/VendorProductView";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']} requireApprovedVendor>
      <VendorProductView />
    </ProtectedRoute>
  );
}
