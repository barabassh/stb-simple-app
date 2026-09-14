import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2.5 w-fit">
      <Link href={href}>
        <ArrowLeftIcon aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
