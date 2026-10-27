import ProtectedRoute from "@/components/ProtectedRoute";
import RentalAdminDetail from "@/components/admin/rentals/RentalAdminDetail";

export const metadata = { title: "Rental | Admin", robots: { index: false } };

export default function Page({ params }: { params: { id: string } }) {
  return <ProtectedRoute requiredRoles={["admin"]}><RentalAdminDetail id={params.id} /></ProtectedRoute>;
}
