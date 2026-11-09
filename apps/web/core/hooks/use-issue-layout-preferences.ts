import { useCallback, useEffect, useState } from "react";

type TPreferences = { collapsed: Record<string, boolean>; hideEmpty: boolean };
const emptyPreferences = (): TPreferences => ({ collapsed: {}, hideEmpty: false });

export function useIssueLayoutPreferences(key?: string) {
  const storageKey = key ? `plane:issue-field-layout:${key}` : undefined;
  const [state, setState] = useState<{ key?: string; value: TPreferences }>({
    key: storageKey,
    value: emptyPreferences(),
  });
  useEffect(() => {
    let value = emptyPreferences();
    try {
      const stored = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? "null") : null;
      if (stored && typeof stored === "object") {
        value = {
          hideEmpty: stored.hideEmpty === true,
          collapsed: Object.fromEntries(
            Object.entries(stored.collapsed ?? {}).filter(([, v]) => typeof v === "boolean")
          ),
        } as TPreferences;
      }
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    setState({ key: storageKey, value });
  }, [storageKey]);

  const preferences = state.key === storageKey ? state.value : emptyPreferences();
  const update = useCallback(
    (change: (previous: TPreferences) => TPreferences) => {
      setState((previous) => {
        const value = change(previous.key === storageKey ? previous.value : emptyPreferences());
        try {
          if (storageKey) localStorage.setItem(storageKey, JSON.stringify(value));
        } catch {
          /* Keep the in-memory preference. */
        }
        return { key: storageKey, value };
      });
    },
    [storageKey]
  );
  return { preferences, update };
}
