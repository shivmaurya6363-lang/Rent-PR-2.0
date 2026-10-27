import ProtectedRoute from "@/components/ProtectedRoute";
import VendorSettings from "@/views/vendor/VendorSettings";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']} requireApprovedVendor>
      <VendorSettings />
    </ProtectedRoute>
  );
}
