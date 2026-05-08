/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import * as LucideIcons from "lucide-react";
import { LayersIcon } from "@plane/propel/icons";

type TIssueTypeIconProps = {
  name?: string;
  color?: string;
};

/**
 * Renders a work-item type icon using the logo_props.icon configuration.
 * Falls back to LayersIcon when no icon name is available.
 */
export const IssueTypeFilterIcon: React.FC<TIssueTypeIconProps> = ({ name, color }) => {
  if (name) {
    const IconComp = (LucideIcons as Record<string, React.FC<React.SVGAttributes<SVGElement>>>)[name];
    if (IconComp) {
      return (
        <span
          className="inline-flex size-4 items-center justify-center"
          style={{ color: color || "currentColor" }}
        >
          <IconComp className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
        </span>
      );
    }
  }
  return <LayersIcon className="h-3 w-3 flex-shrink-0" />;
};
