import { LogOutIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

import { signOut } from "../actions";

export async function SignOutButton() {
  const t = await getTranslations("auth");

  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost">
        <LogOutIcon data-icon="inline-start" aria-hidden />
        {t("signOut")}
      </Button>
    </form>
  );
}
