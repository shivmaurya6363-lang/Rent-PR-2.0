import ProtectedRoute from "@/components/ProtectedRoute";
import VendorProducts from "@/views/vendor/VendorProducts";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']} requireApprovedVendor>
      <VendorProducts />
    </ProtectedRoute>
  );
}
