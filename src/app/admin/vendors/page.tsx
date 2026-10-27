import ProtectedRoute from "@/components/ProtectedRoute";
import AdminVendors from "@/views/admin/AdminVendors";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminVendors />
    </ProtectedRoute>
  );
}
