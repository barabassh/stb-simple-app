import { NotFoundMessage } from "@/components/not-found-message";

// Unknown addresses do not belong to any route group, so this page renders without the app shell.
export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <NotFoundMessage />
    </main>
  );
}
