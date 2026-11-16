/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

export function PlaneWordmark({ width = "126", height = "44", className, color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 126 44"
      preserveAspectRatio="xMinYMid meet"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="PMS"
    >
      <text
        x="0"
        y="42"
        fontSize="58"
        fontWeight="700"
        textLength="126"
        lengthAdjust="spacingAndGlyphs"
        fill={color}
      >
        PMS
      </text>
    </svg>
  );
}
