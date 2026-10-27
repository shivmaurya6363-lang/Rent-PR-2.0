import ProtectedRoute from "@/components/ProtectedRoute";
import AdminPayouts from "@/views/admin/AdminPayouts";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminPayouts />
    </ProtectedRoute>
  );
}
