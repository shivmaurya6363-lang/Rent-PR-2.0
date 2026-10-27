import ProtectedRoute from "@/components/ProtectedRoute";
import AdminSlider from "@/views/admin/AdminSlider";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminSlider />
    </ProtectedRoute>
  );
}
