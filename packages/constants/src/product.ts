/**
 * 产品作用域的细粒度权限 key，与后端 plane/app/permissions/keys.py 的 PRODUCT_* 段一致。
 * 刻意没有 view 类 key：能不能看产品由「产品成员 / 公开 / 评审人」决定，key 只表达读之上的动作。
 */

/** 编辑产品设置（名称 / 代号 / 字典字段 / 负责人 / 可见性 / 描述） */
export const PRODUCT_SETTINGS_EDIT_PERMISSION_KEY = "product.settings.edit" as const;
/** 删除产品 */
export const PRODUCT_SETTINGS_DELETE_PERMISSION_KEY = "product.settings.delete" as const;
/** 添加产品成员 */
export const PRODUCT_MEMBER_INVITE_PERMISSION_KEY = "product.member.invite" as const;
/** 移除产品成员 */
export const PRODUCT_MEMBER_REMOVE_PERMISSION_KEY = "product.member.remove" as const;
/** 给成员挂 / 改角色 */
export const PRODUCT_MEMBER_BIND_ROLE_PERMISSION_KEY = "product.member.bind_role" as const;
/** 建 / 改 / 删角色、配角色权限 */
export const PRODUCT_ROLE_MANAGE_PERMISSION_KEY = "product.role.manage" as const;
/** 新建需求（手动录入 / 标准库导入 / Excel 导入） */
export const PRODUCT_REQUIREMENT_CREATE_PERMISSION_KEY = "product.requirement.create" as const;
/** 编辑需求内容 / 状态 / 模块归属 / 附件 */
export const PRODUCT_REQUIREMENT_EDIT_PERMISSION_KEY = "product.requirement.edit" as const;
/** 删除需求（单删 / 批量删） */
export const PRODUCT_REQUIREMENT_DELETE_PERMISSION_KEY = "product.requirement.delete" as const;
/** 需求模块树增删改 */
export const PRODUCT_REQUIREMENT_MODULE_MANAGE_PERMISSION_KEY = "product.requirement_module.manage" as const;
/** 提交需求评审 */
export const PRODUCT_CHANGE_REQUEST_SUBMIT_PERMISSION_KEY = "product.change_request.submit" as const;
/** 建 / 改 / 删需求基线 */
export const PRODUCT_BASELINE_MANAGE_PERMISSION_KEY = "product.baseline.manage" as const;
/** 产品侧关联 / 解除关联项目 */
export const PRODUCT_PROJECT_LINK_MANAGE_PERMISSION_KEY = "product.project_link.manage" as const;
/** 产品侧的需求 ↔ 用例关联 */
export const PRODUCT_TEST_CASE_LINK_MANAGE_PERMISSION_KEY = "product.test_case_link.manage" as const;

/** 持有其中任一即可进入产品设置区（各页再按自己的 key 细分） */
export const PRODUCT_SETTINGS_ACCESS_PERMISSION_KEYS = [
  PRODUCT_SETTINGS_EDIT_PERMISSION_KEY,
  PRODUCT_SETTINGS_DELETE_PERMISSION_KEY,
  PRODUCT_MEMBER_INVITE_PERMISSION_KEY,
  PRODUCT_MEMBER_REMOVE_PERMISSION_KEY,
  PRODUCT_MEMBER_BIND_ROLE_PERMISSION_KEY,
  PRODUCT_ROLE_MANAGE_PERMISSION_KEY,
] as const;

/** 成员页：加人 / 移人 / 挂角色任一 */
export const PRODUCT_MEMBER_MANAGE_PERMISSION_KEYS = [
  PRODUCT_MEMBER_INVITE_PERMISSION_KEY,
  PRODUCT_MEMBER_REMOVE_PERMISSION_KEY,
  PRODUCT_MEMBER_BIND_ROLE_PERMISSION_KEY,
] as const;
