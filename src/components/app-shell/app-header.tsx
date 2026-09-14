import { HardHatIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { HOME_PATH } from "@/lib/auth/constants";
import type { SessionUser } from "@/lib/auth/session";

export async function AppHeader({ user }: { user: SessionUser }) {
  const t = await getTranslations();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Link href={HOME_PATH} className="flex shrink-0 items-center gap-2 font-semibold">
        <HardHatIcon className="size-5" aria-hidden />
        <span className="sr-only sm:not-sr-only">{t("app.name")}</span>
      </Link>

      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-col items-end leading-tight">
          <span className="max-w-full truncate text-sm font-medium" title={user.fullName}>
            {user.fullName}
          </span>
          <span className="text-xs text-muted-foreground">{t(`users.roles.${user.role}`)}</span>
        </div>
        <Separator orientation="vertical" className="data-vertical:h-6 data-vertical:self-center" />
        <SignOutButton />
      </div>
    </header>
  );
}
