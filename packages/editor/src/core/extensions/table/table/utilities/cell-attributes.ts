/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * @description Parse a colspan/rowspan HTML attribute into a positive integer.
 * @param {string | null} value - The raw attribute value.
 * @returns {number} The span, defaulting to 1.
 */
export const parseSpanAttribute = (value: string | null): number => {
  const span = parseInt(value ?? "1", 10);
  return Number.isNaN(span) || span < 1 ? 1 : span;
};

/**
 * @description Parse the colwidth HTML attribute ("150,150") into a list of widths.
 * Mirrors prosemirror-tables: a list that doesn't match the colspan is dropped so fixTables can rebuild it.
 * @param {HTMLElement} element - The cell element.
 * @returns {number[] | null} The column widths, or null.
 */
export const parseColwidthAttribute = (element: HTMLElement): number[] | null => {
  const colwidth = element.getAttribute("colwidth");
  if (!colwidth) return null;

  const widths = colwidth.split(",").map((width) => parseInt(width, 10));
  if (widths.some((width) => Number.isNaN(width))) return null;

  return widths.length === parseSpanAttribute(element.getAttribute("colspan")) ? widths : null;
};

/**
 * @description Build the inline style attribute for a cell from its color attributes.
 * @param {Record<string, unknown>} attrs - The cell node attributes.
 * @returns {Record<string, string>} An object with a style key, or empty when the cell has no colors.
 */
export const getCellStyleAttributes = (attrs: Record<string, unknown>): Record<string, string> => {
  const styles: string[] = [];
  if (attrs.background && attrs.background !== "none") styles.push(`background-color: ${attrs.background}`);
  if (attrs.textColor) styles.push(`color: ${attrs.textColor}`);

  return styles.length > 0 ? { style: styles.join("; ") } : {};
};
