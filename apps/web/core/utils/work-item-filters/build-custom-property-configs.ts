/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Avatar } from "@plane/ui";
import {
  EQUALITY_OPERATOR,
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
  EXTENDED_COLLECTION_OPERATOR,
  EXTENDED_COMPARISON_OPERATOR,
  CORE_OPERATORS,
  EXTENDED_OPERATORS,
} from "@plane/types";
import type { IUserLite, TFilterConfig, TWorkItemFilterProperty, TSupportedOperators, TOperatorConfigMap } from "@plane/types";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getSingleSelectConfig,
  getMultiSelectConfig,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getTextInputConfig,
  getNumberInputConfig,
  getFileURL,
} from "@plane/utils";
import type { TIssueType, TTypeExtraField } from "@/services/project/project-issue-type.service";
import {
  FIELD_TYPE_ICON,
  getSelectOptions,
  getSelectionMode,
} from "@/components/issues/extra-fields/extra-field-control";
import { IssueTypeFilterIcon } from "./issue-type-filter-icon";

// All operators available for custom properties (core + extended)
const CUSTOM_PROPERTY_ALLOWED_OPERATORS = new Set<TSupportedOperators>([
  ...Object.values(CORE_OPERATORS),
  ...Object.values(EXTENDED_OPERATORS),
]);

const BASE_CUSTOM_PARAMS = {
  isEnabled: true,
  allowedOperators: CUSTOM_PROPERTY_ALLOWED_OPERATORS,
};

// ── per-type operator map factories ─────────────────────────────────────────

function getTextOperatorEntries(field: TTypeExtraField): TOperatorConfigMap {
  const placeholder = `筛选 ${field.name}...`;
  return new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getTextInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.NOT_EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getTextInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.CONTAINS, BASE_CUSTOM_PARAMS, (p) =>
      getTextInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.NOT_CONTAINS, BASE_CUSTOM_PARAMS, (p) =>
      getTextInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
  ]);
}

function getNumberOperatorEntries(field: TTypeExtraField): TOperatorConfigMap {
  const placeholder = `筛选 ${field.name}...`;
  return new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.NOT_EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.LT, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_LT, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.LTE, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_LTE, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.GT, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_GT, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.GTE, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_GTE, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_RANGE, BASE_CUSTOM_PARAMS, (p) =>
      getNumberInputConfig({ isOperatorEnabled: p.isOperatorEnabled, placeholder })
    ),
  ]);
}

function getDateOperatorEntries(): TOperatorConfigMap {
  return new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.NOT_EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.LT, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_LT, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.LTE, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_LTE, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.GT, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_GT, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.GTE, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_GTE, BASE_CUSTOM_PARAMS, (p) =>
      getDatePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, BASE_CUSTOM_PARAMS, (p) =>
      getDateRangePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.NOT_RANGE, BASE_CUSTOM_PARAMS, (p) =>
      getDateRangePickerConfig({ isOperatorEnabled: p.isOperatorEnabled })
    ),
  ]);
}

function getBooleanOperatorEntries(
  booleanOptions: { id: string; label: string; value: string }[]
): TOperatorConfigMap {
  return new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getSingleSelectConfig<{ id: string; label: string; value: string }, string, undefined>(
        { items: booleanOptions, getId: (o) => o.id, getLabel: (o) => o.label, getValue: (o) => o.value },
        { isOperatorEnabled: p.isOperatorEnabled }
      )
    ),
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.NOT_EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getSingleSelectConfig<{ id: string; label: string; value: string }, string, undefined>(
        { items: booleanOptions, getId: (o) => o.id, getLabel: (o) => o.label, getValue: (o) => o.value },
        { isOperatorEnabled: p.isOperatorEnabled }
      )
    ),
  ]);
}

function getSingleSelectOperatorEntries(
  items: { key: string; label: string }[]
): TOperatorConfigMap {
  return new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getSingleSelectConfig<{ key: string; label: string }, string, undefined>(
        { items, getId: (o) => o.key, getLabel: (o) => o.label, getValue: (o) => o.key },
        { isOperatorEnabled: p.isOperatorEnabled }
      )
    ),
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.NOT_EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getSingleSelectConfig<{ key: string; label: string }, string, undefined>(
        { items, getId: (o) => o.key, getLabel: (o) => o.label, getValue: (o) => o.key },
        { isOperatorEnabled: p.isOperatorEnabled }
      )
    ),
  ]);
}

function getMultiSelectOperatorEntries(
  items: { key: string; label: string }[]
): TOperatorConfigMap {
  return new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, BASE_CUSTOM_PARAMS, (p) =>
      getMultiSelectConfig<{ key: string; label: string }, string, undefined>(
        { items, getId: (o) => o.key, getLabel: (o) => o.label, getValue: (o) => o.key },
        { singleValueOperator: EQUALITY_OPERATOR.EXACT, isOperatorEnabled: p.isOperatorEnabled, operatorLabel: "is" }
      )
    ),
    createOperatorConfigEntry(EXTENDED_COLLECTION_OPERATOR.NOT_IN, BASE_CUSTOM_PARAMS, (p) =>
      getMultiSelectConfig<{ key: string; label: string }, string, undefined>(
        { items, getId: (o) => o.key, getLabel: (o) => o.label, getValue: (o) => o.key },
        {
          singleValueOperator: EXTENDED_EQUALITY_OPERATOR.NOT_EXACT,
          isOperatorEnabled: p.isOperatorEnabled,
          operatorLabel: "is not",
        }
      )
    ),
  ]);
}

function getSingleUserOperatorEntries(members: IUserLite[]): TOperatorConfigMap {
  return new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getSingleSelectConfig<IUserLite, string, IUserLite>(
        { items: members, getId: (m) => m.id, getLabel: (m) => m.display_name, getValue: (m) => m.id, getIconData: (m) => m },
        { isOperatorEnabled: p.isOperatorEnabled },
        {
          getOptionIcon: (m) =>
            React.createElement(Avatar, { name: m.display_name, src: getFileURL(m.avatar_url), showTooltip: false, size: "sm" }),
        }
      )
    ),
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.NOT_EXACT, BASE_CUSTOM_PARAMS, (p) =>
      getSingleSelectConfig<IUserLite, string, IUserLite>(
        { items: members, getId: (m) => m.id, getLabel: (m) => m.display_name, getValue: (m) => m.id, getIconData: (m) => m },
        { isOperatorEnabled: p.isOperatorEnabled },
        {
          getOptionIcon: (m) =>
            React.createElement(Avatar, { name: m.display_name, src: getFileURL(m.avatar_url), showTooltip: false, size: "sm" }),
        }
      )
    ),
  ]);
}

function getMultiUserOperatorEntries(members: IUserLite[]): TOperatorConfigMap {
  return new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, BASE_CUSTOM_PARAMS, (p) =>
      getMultiSelectConfig<IUserLite, string, IUserLite>(
        { items: members, getId: (m) => m.id, getLabel: (m) => m.display_name, getValue: (m) => m.id, getIconData: (m) => m },
        { singleValueOperator: EQUALITY_OPERATOR.EXACT, isOperatorEnabled: p.isOperatorEnabled, operatorLabel: "is" },
        {
          getOptionIcon: (m) =>
            React.createElement(Avatar, { name: m.display_name, src: getFileURL(m.avatar_url), showTooltip: false, size: "sm" }),
        }
      )
    ),
    createOperatorConfigEntry(EXTENDED_COLLECTION_OPERATOR.NOT_IN, BASE_CUSTOM_PARAMS, (p) =>
      getMultiSelectConfig<IUserLite, string, IUserLite>(
        { items: members, getId: (m) => m.id, getLabel: (m) => m.display_name, getValue: (m) => m.id, getIconData: (m) => m },
        {
          singleValueOperator: EXTENDED_EQUALITY_OPERATOR.NOT_EXACT,
          isOperatorEnabled: p.isOperatorEnabled,
          operatorLabel: "is not",
        },
        {
          getOptionIcon: (m) =>
            React.createElement(Avatar, { name: m.display_name, src: getFileURL(m.avatar_url), showTooltip: false, size: "sm" }),
        }
      )
    ),
  ]);
}

// ── main export ─────────────────────────────────────────────────────────────

/**
 * Builds TFilterConfig entries for all active custom property fields in a project.
 * Each field gets a unique key of the form `customproperty_<field.id>`.
 * Returns an empty array if inputs are empty or any field's issue type cannot be resolved.
 */
export const buildCustomPropertyConfigs = (
  extraFields: TTypeExtraField[],
  issueTypes: TIssueType[],
  members: IUserLite[]
): TFilterConfig<TWorkItemFilterProperty>[] => {
  const issueTypeMap = new Map(issueTypes.map((t) => [t.id, t]));

  return extraFields
    .map((field): TFilterConfig<TWorkItemFilterProperty> | null => {
      const issueType = issueTypeMap.get(field.issue_type_id);
      if (!issueType) return null;

      const propertyId = `customproperty_${field.id}` as TWorkItemFilterProperty;
      const label = `${field.name}（${issueType.name}）`;
      const iconProps = issueType.logo_props?.icon;
      const propertyIcon = FIELD_TYPE_ICON[field.field_type] ?? FIELD_TYPE_ICON.text;
      const rightContent = React.createElement(IssueTypeFilterIcon, {
        name: iconProps?.name,
        color: iconProps?.color,
      });

      if (field.field_type === "text") {
        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: propertyIcon,
          rightContent,
          isEnabled: true,
          supportedOperatorConfigsMap: getTextOperatorEntries(field),
        });
      }

      if (field.field_type === "number") {
        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: propertyIcon,
          rightContent,
          isEnabled: true,
          supportedOperatorConfigsMap: getNumberOperatorEntries(field),
        });
      }

      if (field.field_type === "date") {
        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: propertyIcon,
          rightContent,
          isEnabled: true,
          supportedOperatorConfigsMap: getDateOperatorEntries(),
        });
      }

      if (field.field_type === "boolean") {
        const booleanOptions = [
          { id: "true", label: "True", value: "true" },
          { id: "false", label: "False", value: "false" },
        ];
        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: propertyIcon,
          rightContent,
          isEnabled: true,
          supportedOperatorConfigsMap: getBooleanOperatorEntries(booleanOptions),
        });
      }

      if (field.field_type === "select") {
        const selectOptions = getSelectOptions(field as any);
        const isMultiple = getSelectionMode(field.options) === "multiple";

        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: propertyIcon,
          rightContent,
          isEnabled: true,
          supportedOperatorConfigsMap: isMultiple
            ? getMultiSelectOperatorEntries(selectOptions)
            : getSingleSelectOperatorEntries(selectOptions),
        });
      }

      if (field.field_type === "user") {
        const isMultiple = getSelectionMode(field.options) === "multiple";

        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: propertyIcon,
          rightContent,
          isEnabled: true,
          supportedOperatorConfigsMap: isMultiple ? getMultiUserOperatorEntries(members) : getSingleUserOperatorEntries(members),
        });
      }

      return null;
    })
    .filter((c): c is TFilterConfig<TWorkItemFilterProperty> => c !== null);
};
