/**
 * 产品上用到的权限 key。产品没有自己的 key：产品对象上的 my_permission_keys 由后端算好
 * （workspace.* 照工作区；project.* 取各关联项目的并集，产品负责人 / 持 workspace.product.edit 的人全有）。
 * 能不能看产品由「公开 / 负责人 / 评审人 / 关联项目成员」决定，不看 key。
 */

/** 编辑产品设置（名称 / 代号 / 字典字段 / 负责人 / 可见性 / 描述） */
export const PRODUCT_SETTINGS_EDIT_PERMISSION_KEY = "workspace.product.edit" as const;
/** 删除产品 */
export const PRODUCT_SETTINGS_DELETE_PERMISSION_KEY = "workspace.product.delete" as const;
/** 新建需求（手动录入 / 标准库导入 / Excel 导入） */
export const PRODUCT_REQUIREMENT_CREATE_PERMISSION_KEY = "project.requirement.create" as const;
/** 编辑需求内容 / 状态 / 模块归属 / 附件 */
export const PRODUCT_REQUIREMENT_EDIT_PERMISSION_KEY = "project.requirement.edit" as const;
/** 删除需求（单删 / 批量删） */
export const PRODUCT_REQUIREMENT_DELETE_PERMISSION_KEY = "project.requirement.delete" as const;
/** 需求模块树增删改 */
export const PRODUCT_REQUIREMENT_MODULE_MANAGE_PERMISSION_KEY = "project.requirement_module.manage" as const;
/** 提交需求评审 */
export const PRODUCT_CHANGE_REQUEST_SUBMIT_PERMISSION_KEY = "project.change_request.create" as const;
/** 建 / 改 / 删需求基线 */
export const PRODUCT_BASELINE_MANAGE_PERMISSION_KEY = "project.requirement_baseline.manage" as const;
/** 产品侧关联 / 解除关联项目 */
export const PRODUCT_PROJECT_LINK_MANAGE_PERMISSION_KEY = "workspace.product.edit" as const;
/** 产品侧的需求 ↔ 用例关联 */
export const PRODUCT_TEST_CASE_LINK_MANAGE_PERMISSION_KEY = "project.requirement.edit" as const;
