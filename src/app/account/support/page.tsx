import { Suspense } from "react";
import SupportClient from "@/components/account/rentals/SupportClient";
export const metadata = { title: "Support" };
export default function Page() { return <Suspense fallback={null}><SupportClient /></Suspense>; }
