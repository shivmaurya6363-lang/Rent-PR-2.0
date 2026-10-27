import { Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RentalsTable from "@/components/admin/rentals/RentalsTable";

export const metadata = { title: "Rentals | Admin", robots: { index: false } };

export default function Page() {
  return <ProtectedRoute requiredRoles={["admin"]}><Suspense fallback={null}><RentalsTable /></Suspense></ProtectedRoute>;
}
