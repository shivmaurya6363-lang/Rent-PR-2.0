"use client";

import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/** Mobile filter drawer. The filter form itself is server-rendered and passed in as children. */
export default function FilterSheet({ children, activeCount }: { children: React.ReactNode; activeCount: number }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-11 lg:hidden"><SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden /> Filters{activeCount > 0 ? ` (${activeCount})` : ""}</Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left"><SheetTitle>Filters</SheetTitle></SheetHeader>
        <div className="mt-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
