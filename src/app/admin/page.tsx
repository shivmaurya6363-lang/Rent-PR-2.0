import ProtectedRoute from "@/components/ProtectedRoute";
import AdminDashboard from "@/views/AdminDashboard";

export default function Page() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <AdminDashboard />
    </ProtectedRoute>
  );
}
