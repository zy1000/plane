/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { CalendarDays } from "lucide-react";
// ui
import { CalendarAfterIcon, CalendarBeforeIcon } from "@plane/propel/icons";
import { CustomSelect } from "@plane/ui";

type DueDate = {
  name: string;
  value: "before" | "after" | "range";
  icon: any;
};

type Props = {
  labels?: Partial<Record<DueDate["value"], string>>;
  title: string;
  value: string;
  onChange: (value: string) => void;
};

const dueDateRange: DueDate[] = [
  {
    name: "before",
    value: "before",
    icon: <CalendarBeforeIcon className="h-4 w-4" />,
  },
  {
    name: "after",
    value: "after",
    icon: <CalendarAfterIcon className="h-4 w-4" />,
  },
  {
    name: "range",
    value: "range",
    icon: <CalendarDays className="h-4 w-4" />,
  },
];

export function DateFilterSelect({ labels, title, value, onChange }: Props) {
  const getLabel = (option: DueDate | undefined) => {
    if (!option) return "";
    return labels?.[option.value] ?? option.name;
  };

  return (
    <CustomSelect
      value={value}
      label={
        <div className="flex items-center gap-2 text-11">
          {dueDateRange.find((item) => item.value === value)?.icon}
          <span>
            {title} {getLabel(dueDateRange.find((item) => item.value === value))}
          </span>
        </div>
      }
      onChange={onChange}
    >
      {dueDateRange.map((option, index) => (
        <CustomSelect.Option key={index} value={option.value}>
          <div className="flex items-center gap-2">
            <span>{option.icon}</span>
            {title} {getLabel(option)}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
}
