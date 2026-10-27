import ProtectedRoute from "@/components/ProtectedRoute";
import VendorRejected from "@/views/VendorRejected";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['vendor']}>
      <VendorRejected />
    </ProtectedRoute>
  );
}
