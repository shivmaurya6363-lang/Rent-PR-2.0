import ProtectedRoute from "@/components/ProtectedRoute";
import VendorProductForm from "@/views/vendor/VendorProductForm";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']} requireApprovedVendor>
      <VendorProductForm />
    </ProtectedRoute>
  );
}
