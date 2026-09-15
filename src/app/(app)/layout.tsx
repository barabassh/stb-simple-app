import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireUser } from "@/lib/auth/current-user";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const t = await getTranslations("common");

  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        <AppHeader user={user} />
        <div className="flex flex-1">
          <AppSidebar user={user} />
          <main className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">{children}</main>
        </div>
        {/* The app has no dark theme; without a fixed theme the toasts would follow the OS setting.
            The top offset starts below the sticky header (h-14), which toasts would otherwise cover. */}
        <Toaster
          theme="light"
          position="top-right"
          offset={{ top: "calc(3.5rem + 1rem)" }}
          mobileOffset={{ top: "calc(3.5rem + 0.5rem)" }}
          containerAriaLabel={t("notifications")}
        />
      </div>
    </TooltipProvider>
  );
}
