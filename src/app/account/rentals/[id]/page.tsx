import RentalDetail from "@/components/account/rentals/RentalDetail";
export const metadata = { title: "Rental details" };
export default function Page({ params }: { params: { id: string } }) { return <RentalDetail id={params.id} />; }
