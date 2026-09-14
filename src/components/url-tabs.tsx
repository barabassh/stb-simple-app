"use client";

import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { TAB_SEARCH_PARAM } from "@/components/data-table/search-params";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type UrlTab = { value: string; label: React.ReactNode; content: React.ReactNode };

type UrlTabsProps = {
  /** The tab read from the URL on the server. */
  value: string;
  /** Shown without a parameter, so the plain address of the card opens it. */
  defaultValue: string;
  tabs: UrlTab[];
};

/**
 * Tabs that keep the open tab in the URL. A tab with a paged table would otherwise fall back
 * to the first tab on every page change, because paging reloads the card from the server.
 */
export function UrlTabs({ value, defaultValue, tabs }: UrlTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [current, setCurrent] = useOptimistic(value);

  function change(next: string) {
    // Paging and sorting belong to the tab being left, so they are not carried over.
    const query =
      next === defaultValue ? "" : `?${new URLSearchParams({ [TAB_SEARCH_PARAM]: next })}`;
    startTransition(() => {
      setCurrent(next);
      router.replace(`${pathname}${query}`, { scroll: false });
    });
  }

  return (
    <Tabs value={current} onValueChange={change}>
      {/* Wraps on a narrow screen, where a row of three tabs is wider than 360px. A wrapped
          trigger cannot take its height from the list, so the height is fixed. */}
      <TabsList className="h-auto max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="h-7">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
