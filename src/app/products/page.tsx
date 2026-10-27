import { Suspense } from "react";
import Products from "@/views/Products";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Products />
    </Suspense>
  );
}
