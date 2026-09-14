"use client";

import { UnexpectedError, type ErrorBoundaryProps } from "@/components/unexpected-error";

// Catches failures of the (app) layout itself, e.g. an unreachable database during requireUser().
export default function RootError(props: ErrorBoundaryProps) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <UnexpectedError {...props} />
    </main>
  );
}
