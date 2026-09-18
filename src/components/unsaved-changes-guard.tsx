"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UnsavedChangesGuardProps = {
  /** True while the form holds changes that leaving the page would lose. */
  when: boolean;
  /** Saves the form; resolves to false when it was not saved, e.g. on validation errors. */
  onSave: () => Promise<boolean>;
};

/** The address of an in-app link the click would follow, or null for anything else. */
function linkTarget(event: MouseEvent): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // A link to an anchor on the same page does not leave it.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Asks whether to save before a link takes the user away from a form with unsaved changes: the
 * back link, "Отмена", the side menu. Closing or reloading the tab gets the browser's own
 * warning, since a page cannot show its dialog there.
 */
export function UnsavedChangesGuard({ when, onSave }: UnsavedChangesGuardProps) {
  const t = useTranslations();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const active = useRef(when);

  useEffect(() => {
    active.current = when;
  }, [when]);

  useEffect(() => {
    // Captured on the document, before Next.js links handle the click at the React root.
    function onClick(event: MouseEvent) {
      if (!active.current) return;
      const href = linkTarget(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (active.current) event.preventDefault();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  function leave(href: string) {
    active.current = false;
    setPendingHref(null);
    router.push(href);
  }

  async function saveAndLeave() {
    if (!pendingHref) return;
    setSaving(true);
    const saved = await onSave();
    setSaving(false);
    // Unsaved, the form shows its errors once the dialog is closed.
    if (saved) leave(pendingHref);
    else setPendingHref(null);
  }

  return (
    <Dialog
      open={pendingHref !== null}
      onOpenChange={(open) => !open && !saving && setPendingHref(null)}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("common.unsavedChanges.title")}</DialogTitle>
          <DialogDescription>{t("common.unsavedChanges.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => setPendingHref(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => pendingHref && leave(pendingHref)}
          >
            {t("common.unsavedChanges.discard")}
          </Button>
          <Button disabled={saving} onClick={saveAndLeave}>
            {t("common.unsavedChanges.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
