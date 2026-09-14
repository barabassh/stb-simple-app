import { HouseIcon, ScrollTextIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { HOME_PATH } from "@/lib/auth/constants";
import type { SessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions";

import { NavLink } from "./nav-link";

type NavItem = {
  key: "home" | "users" | "audit";
  href: string;
  icon: LucideIcon;
  permission?: Permission;
};

const NAV_ITEMS: NavItem[] = [
  { key: "home", href: HOME_PATH, icon: HouseIcon },
  { key: "users", href: "/users", icon: UsersIcon, permission: "users.read" },
  { key: "audit", href: "/audit", icon: ScrollTextIcon, permission: "audit.read" },
];

export async function AppSidebar({ user }: { user: SessionUser }) {
  const t = await getTranslations("nav");
  const items = NAV_ITEMS.filter((item) => !item.permission || can(user, item.permission));

  return (
    // Collapses to an icon rail below 1280px (docs/ТЗ.md, 3.2) to leave the width to the content.
    <aside className="sticky top-14 h-[calc(100svh-3.5rem)] w-14 shrink-0 overflow-y-auto border-r bg-sidebar xl:w-60">
      <nav aria-label={t("label")} className="flex flex-col gap-1 p-2 xl:p-3">
        {items.map(({ key, href, icon: Icon }) => (
          <NavLink key={key} href={href} icon={<Icon aria-hidden />} label={t(key)} />
        ))}
      </nav>
    </aside>
  );
}
