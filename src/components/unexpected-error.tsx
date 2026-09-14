"use client";

import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { HOME_PATH } from "@/lib/auth/constants";

export type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export function UnexpectedError({
  error,
  reset,
  className,
}: ErrorBoundaryProps & { className?: string }) {
  const t = useTranslations("errors");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // reset() alone only re-renders on the client; a failed Server Component has to be requested again.
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <StatusMessage
      icon={TriangleAlertIcon}
      title={t("unexpected.title")}
      description={t("unexpected.description")}
      details={error.digest && t("unexpected.code", { digest: error.digest })}
      className={className}
    >
      <Button onClick={retry} disabled={isPending}>
        {t("unexpected.retry")}
      </Button>
      <Button variant="outline" asChild>
        <Link href={HOME_PATH}>{t("backHome")}</Link>
      </Button>
    </StatusMessage>
  );
}
