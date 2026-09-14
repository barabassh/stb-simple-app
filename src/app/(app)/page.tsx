import {
  CalculatorIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Section = {
  key: "users" | "projects" | "estimates" | "dashboard";
  icon: LucideIcon;
  /** Sections without a route are shown as "in development". */
  href?: string;
  permission?: Permission;
};

const SECTIONS: Section[] = [
  { key: "users", icon: UsersIcon, href: "/users", permission: "users.read" },
  { key: "projects", icon: FolderKanbanIcon },
  { key: "estimates", icon: CalculatorIcon },
  { key: "dashboard", icon: LayoutDashboardIcon },
];

export default async function HomePage() {
  const user = await requireUser();
  const t = await getTranslations("home");
  const sections = SECTIONS.filter(
    (section) => !section.permission || can(user, section.permission),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("greeting", { name: user.fullName })}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
        {sections.map(({ key, icon: Icon, href }) => {
          const card = (
            <Card
              className={cn(
                "h-full",
                href ? "transition-colors group-hover/section:bg-muted/50" : "opacity-60",
              )}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {t(`sections.${key}.title`)}
                </CardTitle>
                <CardDescription>{t(`sections.${key}.description`)}</CardDescription>
                {!href && (
                  <Badge variant="secondary" className="mt-1">
                    {t("inDevelopment")}
                  </Badge>
                )}
              </CardHeader>
            </Card>
          );

          return (
            <li key={key}>
              {href ? (
                <Link
                  href={href}
                  className="group/section block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {card}
                </Link>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
