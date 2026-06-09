/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { CircleDotDashed, CircleX } from "lucide-react";

import { CycleIcon } from "../project/cycle-icon";
import { CircleDotFullIcon } from "./circle-dot-full-icon";
import type { ICycleGroupIcon } from "./helper";
import { CYCLE_GROUP_COLORS } from "./helper";

const iconComponents = {
  in_progress: CycleIcon,
  testing: CycleIcon,
  returned: CircleX,
  not_started: CircleDotDashed,
  completed: CircleDotFullIcon,
  cancelled: CircleX,
};

export function CycleGroupIcon({
  className = "",
  color,
  cycleGroup,
  height = "12px",
  width = "12px",
}: ICycleGroupIcon) {
  const CycleIconComponent = iconComponents[cycleGroup] || CycleIcon;

  return (
    <CycleIconComponent
      height={height}
      width={width}
      color={color ?? CYCLE_GROUP_COLORS[cycleGroup]}
      className={`flex-shrink-0 ${className}`}
    />
  );
}
