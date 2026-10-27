import ProtectedRoute from "@/components/ProtectedRoute";
import AdminFooter from "@/views/admin/AdminFooter";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminFooter />
    </ProtectedRoute>
  );
}
