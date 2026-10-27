import ProtectedRoute from "@/components/ProtectedRoute";
import VendorDashboard from "@/views/VendorDashboard";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']} requireApprovedVendor>
      <VendorDashboard />
    </ProtectedRoute>
  );
}
