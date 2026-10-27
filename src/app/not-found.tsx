import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="text-center">
        <h1 className="mb-2 text-5xl font-bold">404</h1>
        <p className="mb-6 text-lg text-muted-foreground">We couldn&apos;t find that page.</p>
        <Link href="/" className="text-primary underline underline-offset-4">
          Return to home
        </Link>
      </div>
    </main>
  );
}
