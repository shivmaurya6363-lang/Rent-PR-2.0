import ProtectedRoute from "@/components/ProtectedRoute";
import AdminReports from "@/views/admin/AdminReports";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminReports />
    </ProtectedRoute>
  );
}
