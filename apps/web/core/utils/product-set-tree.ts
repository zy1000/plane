/**
 * 产品集父子展示的分组规则：凡是产品集和产品一起出现的列表 / 树 / 下拉，都把集内产品挂在产品集下面。
 * 只认传进来的这批数据：产品集不在列表里时，它的成员按独立产品显示（例如项目只关联了产品、没关联产品集）。
 * 画法（图标、连线）在 components/products/sets/product-set-tree.tsx。
 */

export type TProductSetTreeGroup<T> = { set: T; children: T[] };

export type TProductSetTree<T> = {
  /** 产品集，按传入顺序；children 是同一批数据里属于它的产品，按传入顺序 */
  groups: TProductSetTreeGroup<T>[];
  /** 不属于（列表里任何）产品集的产品 */
  standalone: T[];
};

type TAccessors<T> = {
  getId: (item: T) => string;
  isSet: (item: T) => boolean;
  /** 所属产品集 id；不属于任何产品集时返回 null / undefined */
  getSetId: (item: T) => string | null | undefined;
};

export const buildProductSetTree = <T,>(items: T[], { getId, isSet, getSetId }: TAccessors<T>): TProductSetTree<T> => {
  const groups: TProductSetTreeGroup<T>[] = [];
  const groupBySetId = new Map<string, TProductSetTreeGroup<T>>();
  for (const item of items) {
    if (!isSet(item)) continue;
    const group = { set: item, children: [] as T[] };
    groups.push(group);
    groupBySetId.set(getId(item), group);
  }
  const standalone: T[] = [];
  for (const item of items) {
    if (isSet(item)) continue;
    const setId = getSetId(item);
    const group = setId ? groupBySetId.get(setId) : undefined;
    if (group) group.children.push(item);
    else standalone.push(item);
  }
  return { groups, standalone };
};

/** 拍平成「产品集、它的成员、下一个产品集…、独立产品」的顺序，下拉选项这类一维列表用 */
export type TProductSetTreeRow<T> = { item: T; kind: "set" | "child" | "product"; isLastChild: boolean };

export const flattenProductSetTree = <T,>({ groups, standalone }: TProductSetTree<T>): TProductSetTreeRow<T>[] => [
  ...groups.flatMap(({ set, children }) => [
    { item: set, kind: "set" as const, isLastChild: false },
    ...children.map((child, index) => ({
      item: child,
      kind: "child" as const,
      isLastChild: index === children.length - 1,
    })),
  ]),
  ...standalone.map((item) => ({ item, kind: "product" as const, isLastChild: false })),
];
