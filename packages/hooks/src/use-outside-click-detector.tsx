/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
import { useEffect } from "react";

export const useOutsideClickDetector = (
  ref: React.RefObject<HTMLElement> | any,
  callback: () => void,
  useCapture = false
) => {
  const handleClick = (event: MouseEvent) => {
    if (ref.current && !ref.current.contains(event.target as any)) {
      // check for the closest element with attribute name data-prevent-outside-click
      const preventOutsideClickElement = (event.target as unknown as HTMLElement | undefined)?.closest(
        "[data-prevent-outside-click]"
      );
      // 仅当点击落在「不含本组件」的防关闭区域时跳过（例如 portaled 下拉面板）。
      // 若本组件本身就在同一防关闭容器内（如 Dialog），点击容器其他区域仍应关闭下拉。
      if (preventOutsideClickElement && !preventOutsideClickElement.contains(ref.current)) {
        return;
      }
      // else call the callback
      callback();
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClick, useCapture);
    return () => {
      document.removeEventListener("mousedown", handleClick, useCapture);
    };
  });
};
