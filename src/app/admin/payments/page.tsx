import { Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import PaymentsAdmin from "@/components/admin/rentals/PaymentsAdmin";

export const metadata = { title: "Payments | Admin", robots: { index: false } };

export default function Page() {
  return <ProtectedRoute requiredRoles={["admin"]}><Suspense fallback={null}><PaymentsAdmin /></Suspense></ProtectedRoute>;
}
