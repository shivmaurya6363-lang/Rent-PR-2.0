import ProtectedRoute from "@/components/ProtectedRoute";
import AdminMonthlyRent from "@/views/admin/AdminMonthlyRent";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminMonthlyRent />
    </ProtectedRoute>
  );
}
