import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLegal from "@/views/admin/AdminLegal";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminLegal />
    </ProtectedRoute>
  );
}
