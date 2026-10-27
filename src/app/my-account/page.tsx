import ProtectedRoute from "@/components/ProtectedRoute";
import MyAccount from "@/views/MyAccount";

export default function Page() {
  return (
    <ProtectedRoute>
      <MyAccount />
    </ProtectedRoute>
  );
}
