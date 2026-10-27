import ProtectedRoute from "@/components/ProtectedRoute";
import AdminProducts from "@/views/admin/AdminProducts";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminProducts />
    </ProtectedRoute>
  );
}
