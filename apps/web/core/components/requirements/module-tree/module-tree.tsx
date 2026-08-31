"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EllipsisOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Dropdown, Input, Tree } from "antd";
import type { TreeProps } from "antd";
import { FolderOpenDot, Layers, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProjectRequirementModuleGroup, TRequirementModule } from "@plane/types";
import { cn } from "@plane/utils";

const PRODUCT_KEY_PREFIX = "product:";

const toProductTreeKey = (productId: string) => `${PRODUCT_KEY_PREFIX}${productId}`;

const parseProductTreeKey = (key: string): string | null =>
  key.startsWith(PRODUCT_KEY_PREFIX) ? key.slice(PRODUCT_KEY_PREFIX.length) : null;

const treeContainsModule = (modules: TRequirementModule[], moduleId: string): boolean =>
  modules.some((item) => item.id === moduleId || treeContainsModule(item.children ?? [], moduleId));

const findProductIdForModule = (groups: TProjectRequirementModuleGroup[], moduleId: string): string | null =>
  groups.find((group) => treeContainsModule(group.modules, moduleId))?.product_id ?? null;

/** 独立的输入组件，避免 Tree 重渲染导致输入法中断（与 QA 用例模块树同款） */
const ModuleNameInput = ({
  defaultValue = "",
  placeholder = "",
  onCommit,
}: {
  defaultValue?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) => {
  const [value, setValue] = useState(defaultValue);
  const committedRef = useRef(false);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value);
  };

  return (
    <div className="w-full" onClick={(e) => e.stopPropagation()}>
      <Input
        size="small"
        autoFocus
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onPressEnter={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export type TRequirementModuleTreeProps = {
  modules: TRequirementModule[];
  /** 「全部」节点的计数（作用域内全部需求数，含未挂靠的行） */
  total: number;
  /** null = 「全部」 */
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  /** 项目页只读：不渲染 hover 菜单与临时输入节点 */
  readonly?: boolean;
  /** 关掉根节点「全部」；项目页三级树保持默认 true */
  showAllNode?: boolean;
  /** 「全部」根节点的文案，默认「全部需求」 */
  allLabel?: string;
  /** 传入后树为「全部需求 → 产品 → 模块」；不传则「全部 → 模块」 */
  productGroups?: TProjectRequirementModuleGroup[];
  selectedProductId?: string | null;
  onSelectProduct?: (productId: string | null) => void;
  onCreate?: (parentId: string | null, name: string) => Promise<unknown>;
  onRename?: (moduleId: string, name: string) => Promise<unknown>;
  /** 只上抛目标，删除确认弹窗由外层渲染 */
  onDelete?: (module: { id: string; name: string }) => void;
};

/**
 * 需求模块树（antd Tree）。库页 / 产品页可编辑，项目页只读复用。
 *
 * 编辑交互与 QA 用例模块树一致：hover 出菜单（添加 / 重命名 / 删除）、
 * 「添加」在节点下插入 `__creating__` 临时行内输入、重命名就地替换标题。
 */
export const RequirementModuleTree = (props: TRequirementModuleTreeProps) => {
  const {
    modules,
    total,
    selectedModuleId,
    onSelect,
    readonly = false,
    showAllNode = true,
    allLabel,
    productGroups,
    selectedProductId = null,
    onSelectProduct,
    onCreate,
    onRename,
    onDelete,
  } = props;
  const { t } = useTranslation();
  const [creatingParentId, setCreatingParentId] = useState<string | "all" | null>(null);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(["all"]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);

  useEffect(() => {
    if (!productGroups?.length) return;
    const productKeys = productGroups.map((group) => toProductTreeKey(group.product_id));
    setExpandedKeys((current) => {
      const next = new Set(current);
      next.add("all");
      for (const key of productKeys) next.add(key);
      if (next.size === current.length && productKeys.every((key) => current.includes(key))) return current;
      return Array.from(next);
    });
  }, [productGroups]);

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const handleAddUnderNode = (parentId: string | "all") => {
    setRenamingModuleId(null);
    setCreatingParentId(parentId);
    setExpandedKeys((current) => (current.includes(parentId) ? current : [...current, parentId]));
  };

  const handleCreateCommit = (parentId: string | "all", value: string) => {
    setCreatingParentId(null);
    const name = value.trim();
    if (!name || !onCreate) return;
    void onCreate(parentId === "all" ? null : parentId, name);
  };

  const handleRenameCommit = (moduleId: string, value: string) => {
    setRenamingModuleId(null);
    const name = value.trim();
    if (!name || !onRename) return;
    void onRename(moduleId, name);
  };

  const handleSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    const key = String(info?.node?.key ?? "");
    if (key.startsWith("__creating__")) return;
    const productId = parseProductTreeKey(key);
    // 再次点击同一节点是「取消选择」——忽略，保持当前选中不变
    if (!info.selected) {
      if (key === "all") {
        onSelect(null);
        onSelectProduct?.(null);
      }
      return;
    }
    const next = selectedKeys[0] as string | undefined;
    if (!next || next === "all") {
      onSelect(null);
      onSelectProduct?.(null);
      return;
    }
    if (productId) {
      onSelect(null);
      onSelectProduct?.(productId);
      return;
    }
    onSelect(next);
    if (onSelectProduct && productGroups) {
      const parentProductId = findProductIdForModule(productGroups, next);
      if (parentProductId) onSelectProduct(parentProductId);
    }
  };

  const renderNodeTitle = (module: TRequirementModule) => {
    if (renamingModuleId === module.id) {
      return (
        <ModuleNameInput
          placeholder={t("requirement_modules.name_placeholder")}
          defaultValue={module.name}
          onCommit={(value) => handleRenameCommit(module.id, value)}
        />
      );
    }
    const menuItems = [
      {
        key: "add",
        label: (
          <Button type="text" size="small" onClick={() => handleAddUnderNode(module.id)}>
            {t("requirement_modules.add")}
          </Button>
        ),
      },
      {
        key: "rename",
        label: (
          <Button
            type="text"
            size="small"
            onClick={() => {
              setCreatingParentId(null);
              setRenamingModuleId(module.id);
            }}
          >
            {t("requirement_modules.rename")}
          </Button>
        ),
      },
      {
        key: "delete",
        label: (
          <Button type="text" danger size="small" onClick={() => onDelete?.({ id: module.id, name: module.name })}>
            {t("requirement_modules.delete")}
          </Button>
        ),
      },
    ];
    const active = selectedModuleId === module.id;
    return (
      <div className="group flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center",
              active ? "text-accent-primary" : "text-secondary"
            )}
          >
            <FolderOpenDot size={14} />
          </span>
          <span className={cn("truncate text-sm", active ? "font-medium text-accent-primary" : "text-primary")}>
            {module.name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn("text-xs tabular-nums", active ? "text-accent-primary" : "text-secondary")}>
            {module.count}
          </span>
          {!readonly && (
            <Dropdown trigger={["hover"]} menu={{ items: menuItems }}>
              <Button
                type="text"
                icon={<EllipsisOutlined />}
                size="small"
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Dropdown>
          )}
        </div>
      </div>
    );
  };

  const renderCreatingInput = (parentId: string | "all") => (
    <ModuleNameInput
      placeholder={t("requirement_modules.name_placeholder")}
      onCommit={(value) => handleCreateCommit(parentId, value)}
    />
  );

  const renderProductTitle = (group: TProjectRequirementModuleGroup) => {
    const active = !selectedModuleId && selectedProductId === group.product_id;
    return (
      <div className="group flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center",
              active ? "text-accent-primary" : "text-secondary"
            )}
          >
            <Package size={14} />
          </span>
          <span
            className={cn("truncate text-sm", active ? "font-medium text-accent-primary" : "text-primary")}
            title={group.product_name}
          >
            {group.product_name}
          </span>
        </div>
        <span className={cn("text-xs tabular-nums", active ? "text-accent-primary" : "text-secondary")}>
          {group.total}
        </span>
      </div>
    );
  };

  const buildTreeNodes = (list: TRequirementModule[]): NonNullable<TreeProps["treeData"]> =>
    list.map((node) => {
      const creatingChild =
        !readonly && creatingParentId === node.id
          ? [
              {
                title: renderCreatingInput(node.id),
                key: `__creating__${node.id}`,
                icon: <PlusOutlined />,
                selectable: false,
              },
            ]
          : [];
      return {
        title: renderNodeTitle(node),
        key: node.id,
        children: [...creatingChild, ...buildTreeNodes(node.children ?? [])],
      };
    });

  const treeData = useMemo(() => {
    const moduleNodes = buildTreeNodes(modules);
    const childNodes = productGroups
      ? productGroups.map((group) => ({
          title: renderProductTitle(group),
          key: toProductTreeKey(group.product_id),
          children: buildTreeNodes(group.modules),
        }))
      : moduleNodes;
    if (!showAllNode) return childNodes;
    const isAllActive = !selectedModuleId && !selectedProductId;
    return [
      {
        title: (
          <div className="group flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center",
                  isAllActive ? "text-accent-primary" : "text-secondary"
                )}
              >
                <Layers size={14} />
              </span>
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  isAllActive ? "text-accent-primary" : "text-primary"
                )}
              >
                {allLabel ?? t("requirement_modules.all")}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  isAllActive ? "text-accent-primary" : "text-secondary"
                )}
              >
                {total}
              </span>
              {!readonly && (
                <Dropdown
                  trigger={["hover"]}
                  menu={{
                    items: [
                      {
                        key: "add",
                        label: (
                          <Button type="text" size="small" onClick={() => handleAddUnderNode("all")}>
                            {t("requirement_modules.add")}
                          </Button>
                        ),
                      },
                    ],
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<EllipsisOutlined />}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </Dropdown>
              )}
            </div>
          </div>
        ),
        key: "all",
        children: [
          ...(!readonly && creatingParentId === "all"
            ? [
                {
                  title: renderCreatingInput("all"),
                  key: "__creating__root",
                  icon: <PlusOutlined />,
                  selectable: false,
                },
              ]
            : []),
          ...childNodes,
        ],
      },
    ];
    // buildTreeNodes 捕获了下面这些状态，逐一列出让 memo 正确失效
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modules,
    productGroups,
    total,
    showAllNode,
    allLabel,
    readonly,
    creatingParentId,
    renamingModuleId,
    selectedModuleId,
    selectedProductId,
    t,
  ]);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .requirement-module-tree.ant-tree,
        .requirement-module-tree .ant-tree { background: transparent !important; }
        .requirement-module-tree .ant-tree-indent-unit { width: 10px !important; }
        .requirement-module-tree .ant-tree-switcher {
          width: 20px !important;
          margin-inline-end: 0px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          margin-top: 2px !important;
        }
        .requirement-module-tree .ant-tree-node-content-wrapper { padding-inline: 0px !important; min-width: 0; }
        .requirement-module-tree .ant-tree-title { display: block; min-width: 0; }
        .requirement-module-tree .ant-tree-treenode-selected,
        .requirement-module-tree .ant-tree-treenode-selected::before,
        .requirement-module-tree .ant-tree-treenode-selected > .ant-tree-node-content-wrapper,
        .requirement-module-tree .ant-tree-treenode-selected > .ant-tree-node-content-wrapper:hover,
        .requirement-module-tree .ant-tree-node-content-wrapper.ant-tree-node-selected,
        .requirement-module-tree .ant-tree-node-content-wrapper.ant-tree-node-selected:hover {
          background: transparent !important;
          box-shadow: none !important;
        }
      `,
        }}
      />
      <Tree
        blockNode
        showLine={false}
        onSelect={handleSelect}
        onExpand={onExpand}
        expandedKeys={expandedKeys}
        autoExpandParent={autoExpandParent}
        treeData={treeData}
        selectedKeys={
          selectedModuleId
            ? [selectedModuleId]
            : selectedProductId
              ? [toProductTreeKey(selectedProductId)]
              : showAllNode
                ? ["all"]
                : []
        }
        className="requirement-module-tree py-1"
      />
    </>
  );
};
