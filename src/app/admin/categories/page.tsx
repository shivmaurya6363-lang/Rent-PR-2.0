import ProtectedRoute from "@/components/ProtectedRoute";
import AdminCategories from "@/views/admin/AdminCategories";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminCategories />
    </ProtectedRoute>
  );
}
