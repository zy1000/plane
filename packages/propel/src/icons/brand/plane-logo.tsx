/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

export function PlaneLogo({ width = "148", height = "52", className, color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 148 52"
      preserveAspectRatio="xMinYMid meet"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="PMS"
    >
      <text
        x="0"
        y="50"
        fontSize="68"
        fontWeight="700"
        textLength="148"
        lengthAdjust="spacingAndGlyphs"
        fill={color}
      >
        PMS
      </text>
    </svg>
  );
}
