import ProtectedRoute from "@/components/ProtectedRoute";
import MyOrders from "@/views/MyOrders";

export default function Page() {
  return (
    <ProtectedRoute>
      <MyOrders />
    </ProtectedRoute>
  );
}
