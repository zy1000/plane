# 工号补全命令（backfill_employee_id）

从 LDAP 批量补全所有用户的工号（`employee_id`）的 Django 自定义管理命令。

- 命令文件：`apps/api/plane/db/management/commands/backfill_employee_id.py`
- 工号存储位置：`UserExtraInfo.employee_id`（与 `User` 一对一关联）
- 工号来源：LDAP 用户条目的 `employeeID` 属性

## 前置条件

数据库中必须已存在可用的 LDAP 配置（`LdapConfig`），且以下字段齐全：

- `server_url`
- `bind_dn`
- `bind_password`（加密存储，命令内部用 `decrypt_data` 解密）
- `base_dn`
- `user_search_filter`（默认 `(mail=%(user)s)`）

若未配置或配置不完整，命令会打印提示并直接退出，不做任何修改。

> 如果还没有 LDAP 配置，可先执行 `python manage.py migrate_ldap_env` 从环境变量迁移生成。

## 使用方式

在 `apps/api` 目录下执行：

```bash
# 只补全缺失的工号（已有工号的用户跳过）
python manage.py backfill_employee_id

# 强制覆盖：重新拉取并覆盖所有用户已有的工号
python manage.py backfill_employee_id --overwrite
```

### 参数

| 参数 | 说明 |
| --- | --- |
| `--overwrite` | 覆盖已存在的工号。默认不带该参数时，只补全工号为空的用户。 |

## 执行逻辑

1. 读取数据库中的 `LdapConfig` 配置，解密绑定密码；配置缺失或不完整则跳过。
2. 用绑定账号建立**单个**管理员连接并在整个流程中复用，避免逐用户重复绑定。
3. 遍历所有有邮箱的 `User`：
   - 默认模式下，已有工号的用户直接跳过；
   - 用 `user_search_filter` 在 LDAP 中按邮箱搜索该用户，取 `entry.employeeID.value` 作为工号；
   - **取不到工号的用户直接跳过**（搜索无结果、无 `employeeID` 属性、属性为空或搜索异常）；
   - 取到则写入 `UserExtraInfo.employee_id`。
4. 结束后打印统计信息。

## 输出示例

```text
  alice@example.com -> 100231
  bob@example.com -> 100245
完成：共处理 128 个用户，更新 96 个工号，跳过 32 个
```

- `更新`：成功从 LDAP 取到工号并写入的用户数。
- `跳过`：已有工号（非 `--overwrite` 模式）或在 LDAP 中取不到工号的用户数。

## 相关代码

- 取工号的逻辑与 `apps/api/plane/app/views/custom/ldap_sync.py` 中的 LDAP 同步保持一致。
- LDAP 搜索的属性列表参考 `apps/api/plane/authentication/utils/ldap.py`。
