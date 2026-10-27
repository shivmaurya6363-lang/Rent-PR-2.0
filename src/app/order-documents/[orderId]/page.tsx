import ProtectedRoute from "@/components/ProtectedRoute";
import OrderDocuments from "@/views/OrderDocuments";

export default function Page() {
  return (
    <ProtectedRoute>
      <OrderDocuments />
    </ProtectedRoute>
  );
}
