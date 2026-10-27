import ProtectedRoute from "@/components/ProtectedRoute";
import AdminOrders from "@/views/admin/AdminOrders";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminOrders />
    </ProtectedRoute>
  );
}
