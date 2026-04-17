/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";

/** Default progress stroke color (emerald, matches common “completion ring” UI). */
const DEFAULT_PROGRESS_STROKE = "#10B981";
/** Light gray track, concentric with progress ring. */
const TRACK_STROKE = "#E5E7EB";

interface ICircularProgressIndicator {
  size: number;
  percentage: number;
  strokeWidth?: number;
  /** Background ring width; defaults to thinner than `strokeWidth`. */
  trackStrokeWidth?: number;
  strokeColor?: string;
  children?: React.ReactNode;
}

export function CircularProgressIndicator(props: ICircularProgressIndicator) {
  const {
    size = 40,
    percentage = 25,
    strokeWidth = 6,
    trackStrokeWidth: trackStrokeWidthProp,
    strokeColor = "stroke-success",
    children,
  } = props;

  const progressStroke = strokeWidth;
  const trackStroke =
    trackStrokeWidthProp ??
    Math.max(1.75, Math.min(progressStroke - 0.75, progressStroke * 0.62));

  const sqSize = size;
  const radius = (size - progressStroke) / 2;
  const viewBox = `0 0 ${sqSize} ${sqSize}`;
  const dashArray = radius * Math.PI * 2;
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  const dashOffset = dashArray - (dashArray * clampedPercentage) / 100;

  return (
    <div className="relative inline-flex shrink-0">
      <svg width={size} height={size} viewBox={viewBox} fill="none" className="block">
        <circle
          className="fill-none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={TRACK_STROKE}
          strokeWidth={`${trackStroke}px`}
        />
        <circle
          className={`fill-none ${strokeColor}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={`${progressStroke}px`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            ...(strokeColor === "stroke-success" ? { stroke: DEFAULT_PROGRESS_STROKE } : {}),
            strokeDasharray: dashArray,
            strokeDashoffset: dashOffset,
          }}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
