import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireUser } from "@/lib/auth/current-user";

export default async function HomePage() {
  await requireUser();
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-2 p-8">
      <h1 className="text-3xl font-semibold">{t("app.name")}</h1>
      <p className="text-muted-foreground">{t("home.placeholder")}</p>
      {/* Temporary place until the application header appears in step 3. */}
      <div className="mt-4">
        <SignOutButton />
      </div>
    </main>
  );
}
