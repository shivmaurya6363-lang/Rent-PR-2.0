import ProtectedRoute from "@/components/ProtectedRoute";
import AdminCoupons from "@/views/admin/AdminCoupons";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminCoupons />
    </ProtectedRoute>
  );
}
