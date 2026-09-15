"use client";

import { PrinterIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  const opened = useRef(false);

  // The view exists to be printed, so the dialog opens at once. The ref keeps the second effect
  // run of Strict Mode in development from opening it twice.
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    // Laid out in a fallback font, the preview would break the lines of the table differently.
    void document.fonts.ready.then(() => window.print());
  }, []);

  return (
    <Button onClick={() => window.print()}>
      <PrinterIcon aria-hidden />
      {label}
    </Button>
  );
}
