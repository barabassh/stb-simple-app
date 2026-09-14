"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { TABLE_SEARCH_PARAMS } from "./search-params";

const TEXT_FILTER_DEBOUNCE_MS = 300;

export type FilterNavigate = (
  changes: Record<string, string | null>,
  history?: "push" | "replace",
) => void;

/** Writes filter changes to the URL; an empty value removes the parameter, and paging starts over. */
export function useFilterNavigation(): FilterNavigate {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The address bar changes only when a navigation commits. A second change made before that
  // (two debounced dates firing together) has to build on the query the first one requested.
  const pendingSearch = useRef<string | null>(null);

  useEffect(() => {
    if (pendingSearch.current === searchParams.toString()) pendingSearch.current = null;
  }, [searchParams]);

  return useCallback(
    (changes, history = "push") => {
      // Read at call time rather than from props: a debounced filter fires later
      // and must not undo a filter changed in the meantime.
      const current = new URLSearchParams(window.location.search).toString();
      const params = new URLSearchParams(pendingSearch.current ?? current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete(TABLE_SEARCH_PARAMS.page);

      const search = params.toString();
      pendingSearch.current = search === current ? null : search;
      router[history](search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
}

/**
 * Keeps a typed filter in local state and writes it to the URL once typing pauses.
 * `value` is the filter as parsed from the URL; `clear` empties the input when the caller
 * resets the filters itself.
 */
export function useDebouncedFilter(value: string, param: string, navigate: FilterNavigate) {
  const [input, setInput] = useState(value);
  // Tells the value this hook wrote to the URL apart from outside changes (back button, reset link).
  const pushed = useRef(value);

  useEffect(() => {
    if (value !== pushed.current) {
      pushed.current = value;
      setInput(value);
    }
  }, [value]);

  useEffect(() => {
    const next = input.trim();
    if (next === pushed.current) return;

    const timer = setTimeout(() => {
      pushed.current = next;
      navigate({ [param]: next }, "replace");
    }, TEXT_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, param, navigate]);

  const clear = useCallback(() => {
    pushed.current = "";
    setInput("");
  }, []);

  return { input, setInput, clear };
}
