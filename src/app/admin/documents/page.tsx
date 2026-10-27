import ProtectedRoute from "@/components/ProtectedRoute";
import AdminDocuments from "@/views/admin/AdminDocuments";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminDocuments />
    </ProtectedRoute>
  );
}
