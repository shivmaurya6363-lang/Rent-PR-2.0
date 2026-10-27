import InvoiceView from "@/components/account/rentals/InvoiceView";
export const metadata = { title: "Invoice" };
export default function Page({ params }: { params: { id: string } }) { return <InvoiceView id={params.id} />; }
