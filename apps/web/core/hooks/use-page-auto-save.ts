/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { debounce } from "lodash-es";
import type { EditorRefApi } from "@plane/editor";
// plane editor
import { convertBinaryDataToBase64String } from "@plane/editor";
// plane types
import type { TDocumentPayload } from "@plane/types";
// store
import type { TPageInstance } from "@/store/pages/base-page";

// Trailing delay after an edit before persisting directly to the backend.
const AUTO_SAVE_DEBOUNCE = 2500;
// Upper bound so continuous typing still flushes periodically.
const AUTO_SAVE_MAX_WAIT = 10000;

type TArgs = {
  editorRef: React.RefObject<EditorRefApi>;
  page: TPageInstance;
  updatePageDescription: (data: TDocumentPayload) => Promise<void>;
};

/**
 * Persists the current editor content directly to the backend (bypassing the
 * live/websocket path) so that content is not lost when the page is closed or
 * the tab/browser is terminated. It saves on a trailing debounce while editing
 * and force-flushes on tab hide, page unload, and component unmount.
 */
export const usePageAutoSave = (args: TArgs) => {
  const hasUnsavedChangesRef = useRef(false);

  // Keep latest args without re-registering listeners / recreating the debounce.
  const argsRef = useRef(args);
  argsRef.current = args;

  const flush = useCallback(async () => {
    if (!hasUnsavedChangesRef.current) return;
    const { editorRef, page, updatePageDescription } = argsRef.current;
    if (!page.isContentEditable) return;
    const editor = editorRef.current;
    if (!editor) return;

    const { binary, html, json } = editor.getDocument();
    if (!binary || !json) return;

    // Optimistically clear the flag; restore it on failure so the next trigger retries.
    hasUnsavedChangesRef.current = false;
    try {
      await updatePageDescription({
        description_binary: convertBinaryDataToBase64String(binary),
        description_html: html,
        description_json: json,
      });
    } catch (error) {
      hasUnsavedChangesRef.current = true;
      console.error("Failed to auto-save page description:", error);
    }
  }, []);

  const debouncedSave = useMemo(
    () => debounce(() => void flush(), AUTO_SAVE_DEBOUNCE, { maxWait: AUTO_SAVE_MAX_WAIT }),
    [flush]
  );

  const markDirty = useCallback(() => {
    hasUnsavedChangesRef.current = true;
    debouncedSave();
  }, [debouncedSave]);

  useEffect(() => {
    const forceFlush = () => {
      debouncedSave.cancel();
      void flush();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") forceFlush();
    };

    window.addEventListener("pagehide", forceFlush);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", forceFlush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // SPA route change / component unmount.
      forceFlush();
    };
  }, [debouncedSave, flush]);

  return { markDirty };
};
