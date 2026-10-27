import ProtectedRoute from "@/components/ProtectedRoute";
import AdminCancellations from "@/views/admin/AdminCancellations";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminCancellations />
    </ProtectedRoute>
  );
}
