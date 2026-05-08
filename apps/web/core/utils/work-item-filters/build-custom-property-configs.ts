/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Avatar } from "@plane/ui";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
import type { IUserLite, TFilterConfig, TWorkItemFilterProperty, TSupportedOperators } from "@plane/types";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getSingleSelectConfig,
  getMultiSelectConfig,
  getDatePickerConfig,
  getTextInputConfig,
  getNumberInputConfig,
  getFileURL,
} from "@plane/utils";
import type { TIssueType, TTypeExtraField } from "@/services/project/project-issue-type.service";
import { getSelectOptions, getSelectionMode } from "@/components/issues/extra-fields/extra-field-control";
import { IssueTypeFilterIcon } from "./issue-type-filter-icon";

type TOperatorConfigs = {
  allowedOperators: Set<TSupportedOperators>;
};

/**
 * Builds TFilterConfig entries for all active custom property fields in a project.
 * Each field gets a unique key of the form `customproperty_<field.id>`.
 * Returns an empty array if inputs are empty or any field's issue type cannot be resolved.
 */
export const buildCustomPropertyConfigs = (
  extraFields: TTypeExtraField[],
  issueTypes: TIssueType[],
  members: IUserLite[],
  operatorConfigs: TOperatorConfigs
): TFilterConfig<TWorkItemFilterProperty>[] => {
  const issueTypeMap = new Map(issueTypes.map((t) => [t.id, t]));

  return extraFields
    .map((field): TFilterConfig<TWorkItemFilterProperty> | null => {
      const issueType = issueTypeMap.get(field.issue_type_id);
      if (!issueType) return null;

      const propertyId = `customproperty_${field.id}` as TWorkItemFilterProperty;
      const label = `${field.name}（${issueType.name}）`;
      const iconProps = issueType.logo_props?.icon;
      const filterIcon: React.FC<React.SVGAttributes<SVGElement>> = () =>
        React.createElement(IssueTypeFilterIcon, {
          name: iconProps?.name,
          color: iconProps?.color,
        });

      const baseParams = {
        isEnabled: true,
        allowedOperators: operatorConfigs.allowedOperators,
      };

      if (field.field_type === "text") {
        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: filterIcon,
          isEnabled: true,
          supportedOperatorConfigsMap: new Map([
            createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, baseParams, (params) =>
              getTextInputConfig({
                isOperatorEnabled: params.isOperatorEnabled,
                placeholder: `筛选 ${field.name}...`,
              })
            ),
          ]),
        });
      }

      if (field.field_type === "number") {
        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: filterIcon,
          isEnabled: true,
          supportedOperatorConfigsMap: new Map([
            createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, baseParams, (params) =>
              getNumberInputConfig({
                isOperatorEnabled: params.isOperatorEnabled,
                placeholder: `筛选 ${field.name}...`,
              })
            ),
          ]),
        });
      }

      if (field.field_type === "date") {
        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: filterIcon,
          isEnabled: true,
          supportedOperatorConfigsMap: new Map([
            createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, baseParams, (params) =>
              getDatePickerConfig({ isOperatorEnabled: params.isOperatorEnabled })
            ),
          ]),
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
          icon: filterIcon,
          isEnabled: true,
          supportedOperatorConfigsMap: new Map([
            createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, baseParams, (params) =>
              getSingleSelectConfig<{ id: string; label: string; value: string }, string, undefined>(
                {
                  items: booleanOptions,
                  getId: (o) => o.id,
                  getLabel: (o) => o.label,
                  getValue: (o) => o.value,
                },
                { isOperatorEnabled: params.isOperatorEnabled }
              )
            ),
          ]),
        });
      }

      if (field.field_type === "select") {
        const selectOptions = getSelectOptions(field as any);
        const isMultiple = getSelectionMode(field.options) === "multiple";

        if (isMultiple) {
          return createFilterConfig<TWorkItemFilterProperty>({
            id: propertyId,
            label,
            icon: filterIcon,
            isEnabled: true,
            supportedOperatorConfigsMap: new Map([
              createOperatorConfigEntry(COLLECTION_OPERATOR.IN, baseParams, (params) =>
                getMultiSelectConfig<{ key: string; label: string }, string, undefined>(
                  {
                    items: selectOptions,
                    getId: (o) => o.key,
                    getLabel: (o) => o.label,
                    getValue: (o) => o.key,
                  },
                  {
                    singleValueOperator: EQUALITY_OPERATOR.EXACT,
                    isOperatorEnabled: params.isOperatorEnabled,
                  }
                )
              ),
            ]),
          });
        }

        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: filterIcon,
          isEnabled: true,
          supportedOperatorConfigsMap: new Map([
            createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, baseParams, (params) =>
              getSingleSelectConfig<{ key: string; label: string }, string, undefined>(
                {
                  items: selectOptions,
                  getId: (o) => o.key,
                  getLabel: (o) => o.label,
                  getValue: (o) => o.key,
                },
                { isOperatorEnabled: params.isOperatorEnabled }
              )
            ),
          ]),
        });
      }

      if (field.field_type === "user") {
        const isMultiple = getSelectionMode(field.options) === "multiple";

        if (isMultiple) {
          return createFilterConfig<TWorkItemFilterProperty>({
            id: propertyId,
            label,
            icon: filterIcon,
            isEnabled: true,
            supportedOperatorConfigsMap: new Map([
              createOperatorConfigEntry(COLLECTION_OPERATOR.IN, baseParams, (params) =>
                getMultiSelectConfig<IUserLite, string, IUserLite>(
                  {
                    items: members,
                    getId: (m) => m.id,
                    getLabel: (m) => m.display_name,
                    getValue: (m) => m.id,
                    getIconData: (m) => m,
                  },
                  {
                    singleValueOperator: EQUALITY_OPERATOR.EXACT,
                    isOperatorEnabled: params.isOperatorEnabled,
                  },
                  {
                    getOptionIcon: (m) =>
                      React.createElement(Avatar, {
                        name: m.display_name,
                        src: getFileURL(m.avatar_url),
                        showTooltip: false,
                        size: "sm",
                      }),
                  }
                )
              ),
            ]),
          });
        }

        return createFilterConfig<TWorkItemFilterProperty>({
          id: propertyId,
          label,
          icon: filterIcon,
          isEnabled: true,
          supportedOperatorConfigsMap: new Map([
            createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, baseParams, (params) =>
              getSingleSelectConfig<IUserLite, string, IUserLite>(
                {
                  items: members,
                  getId: (m) => m.id,
                  getLabel: (m) => m.display_name,
                  getValue: (m) => m.id,
                  getIconData: (m) => m,
                },
                { isOperatorEnabled: params.isOperatorEnabled },
                {
                  getOptionIcon: (m) =>
                    React.createElement(Avatar, {
                      name: m.display_name,
                      src: getFileURL(m.avatar_url),
                      showTooltip: false,
                      size: "sm",
                    }),
                }
              )
            ),
          ]),
        });
      }

      return null;
    })
    .filter((c): c is TFilterConfig<TWorkItemFilterProperty> => c !== null);
};
