import { getTranslations } from "next-intl/server";

import { CompanyProfileBlock } from "@/features/company/components/company-profile-block";
import { requirePagePermission } from "@/lib/auth/current-user";
import type { SessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions";

type SettingsBlock = {
  key: string;
  /** Access to the page does not open a block: each is shown by its own read permission. */
  permission: Permission;
  Component: (props: { viewer: SessionUser }) => Promise<React.ReactNode>;
};

const BLOCKS: SettingsBlock[] = [
  { key: "company", permission: "settings.company.read", Component: CompanyProfileBlock },
];

export default async function SettingsPage() {
  const viewer = await requirePagePermission("settings.read");
  const t = await getTranslations("settings");
  const blocks = BLOCKS.filter((block) => can(viewer, block.permission));

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
      {blocks.map(({ key, Component }) => (
        <Component key={key} viewer={viewer} />
      ))}
    </div>
  );
}
