"use client";

import { UnexpectedError, type ErrorBoundaryProps } from "@/components/unexpected-error";

export default function AppError(props: ErrorBoundaryProps) {
  return <UnexpectedError {...props} className="flex-1" />;
}
