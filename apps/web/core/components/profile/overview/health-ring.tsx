/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
// local imports
import type { TWorkHealthTone } from "./health";

type Props = {
  score: number | null;
  tone: TWorkHealthTone;
};

const toneClasses: Record<TWorkHealthTone, string> = {
  accent: "text-accent-primary",
  danger: "text-danger-primary",
  muted: "text-secondary",
  success: "text-success-primary",
  warning: "text-yellow-500",
};

export function WorkHealthRing({ score, tone }: Props) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = score ?? 0;
  const progressOffset = ((100 - progress) / 100) * circumference;

  return (
    <div className={cn("relative grid size-28 place-items-center", toneClasses[tone])}>
      <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 112 112" aria-hidden="true">
        <circle
          className="stroke-current opacity-10"
          cx="56"
          cy="56"
          r={radius}
          strokeWidth="10"
          fill="none"
        />
        <circle
          className="stroke-current transition-all duration-500 ease-out"
          cx="56"
          cy="56"
          r={radius}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progressOffset}
        />
      </svg>
      <div className="text-center">
        <div className="text-24 font-semibold text-primary">{score ?? "--"}</div>
        <div className="text-11 font-medium text-secondary">/100</div>
      </div>
    </div>
  );
}
