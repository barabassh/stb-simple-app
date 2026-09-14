import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/features/auth/components/login-form";
import { HOME_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect(HOME_PATH);

  const t = await getTranslations();

  return (
    <>
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t("app.name")}</p>
        <h1 className="text-xl font-semibold">{t("auth.login.title")}</h1>
      </div>
      <LoginForm />
    </>
  );
}
