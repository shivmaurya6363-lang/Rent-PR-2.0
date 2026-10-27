import ProtectedRoute from "@/components/ProtectedRoute";
import AdminUsers from "@/views/admin/AdminUsers";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminUsers />
    </ProtectedRoute>
  );
}
