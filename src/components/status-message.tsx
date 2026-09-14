import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type StatusMessageProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Action buttons. */
  children?: React.ReactNode;
  details?: React.ReactNode;
  className?: string;
};

/** Full-area message for the access denied, not found and error screens. */
export function StatusMessage({
  icon: Icon,
  title,
  description,
  children,
  details,
  className,
}: StatusMessageProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-5 p-8 text-center", className)}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children && (
        <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      )}
      {details && <div className="text-xs text-muted-foreground">{details}</div>}
    </div>
  );
}
