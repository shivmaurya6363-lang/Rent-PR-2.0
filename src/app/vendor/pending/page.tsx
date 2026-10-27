import ProtectedRoute from "@/components/ProtectedRoute";
import VendorPending from "@/views/VendorPending";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']}>
      <VendorPending />
    </ProtectedRoute>
  );
}
