"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HOME_PATH } from "@/lib/auth/constants";
import { cn } from "@/lib/utils";

type NavLinkProps = {
  href: string;
  icon: React.ReactNode;
  label: string;
};

export function NavLink({ href, icon, label }: NavLinkProps) {
  const pathname = usePathname();
  const isActive =
    href === HOME_PATH ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex items-center justify-center gap-2.5 rounded-lg p-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          {icon}
          <span className="sr-only">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
