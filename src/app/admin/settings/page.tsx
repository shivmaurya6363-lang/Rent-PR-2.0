import ProtectedRoute from "@/components/ProtectedRoute";
import AdminSettings from "@/views/admin/AdminSettings";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminSettings />
    </ProtectedRoute>
  );
}
