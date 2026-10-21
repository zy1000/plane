"""工作项方案批次 2：类型系统标识 system_key（docs/issue-scheme/issue-scheme-execution-plan.md）。

1. 加可空列 ``issue_types.system_key``。
2. 存量按名字回填（seed_data/issue_scheme.py::LEGACY_NAME_TO_SYSTEM_KEY）：史诗→epic、
   特性→feature、用户故事→story、任务→task、缺陷 / 缺陷(软件)→bug，含软删的行。
   同一项目里两个未删的类型对到同一个标识就中止（下一步的唯一约束会撞上）。
3. 工作区角色模板里按名字摘要的类型权限 key 换成按标识摘要：
   ``project.issue_type_template.<sha1(名字)>.<动作>`` → ``<sha1("system_key:" + 标识)>``。
   「缺陷」「缺陷(软件)」两组合成一组 bug；两组勾的动作不一样时**以现行名字「缺陷(软件)」为准**，
   老名字那组丢掉（取并集会凭空放开权限：本地库的「硬件测试负责人」老名字勾了删除，现行名字没勾）。
   ``permission_keys`` 与描述符 ``issue_type_permission_templates`` 一起换，描述符补上 ``system_key``。
   项目角色不动：下发时已经换成了项目内类型 id 的 key，没有模板 key 要换。
4. 唯一约束：同项目每个系统标识至多一个（未删的行）。

摘要规则与 ``db/models/issue_type.py::issue_type_template_identity`` 一致，迁移里不 import
运行时模块，按同一规则内联。
"""

import hashlib

from django.db import migrations, models

from plane.db.seed_data.issue_scheme import (
    LEGACY_NAME_TO_SYSTEM_KEY,
    SYSTEM_ISSUE_TYPE_NAMES,
    TEMPLATE_IDENTITY_PREFIX,
)

TEMPLATE_KEY_PREFIX = "project.issue_type_template."
DESCRIPTOR_KEY = "issue_type_permission_templates"


def _digest(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _rewrite_template_key(key, digest_map):
    """模板 key 的摘要部分按 digest_map 换掉；不是模板 key 或不在映射里的原样返回。"""
    if not isinstance(key, str) or not key.startswith(TEMPLATE_KEY_PREFIX):
        return [key]
    rest = key[len(TEMPLATE_KEY_PREFIX):]
    if "." not in rest:
        return [key]
    digest, action = rest.rsplit(".", 1)
    targets = digest_map.get(digest)
    if not targets:
        return [key]
    return [f"{TEMPLATE_KEY_PREFIX}{target}.{action}" for target in targets]


def _template_digest(key):
    if not isinstance(key, str) or not key.startswith(TEMPLATE_KEY_PREFIX):
        return None
    rest = key[len(TEMPLATE_KEY_PREFIX):]
    return rest.rsplit(".", 1)[0] if "." in rest else None


def _rewrite_roles(apps, digest_map, descriptor_for, drop_digests_for=None):
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    for role in WorkspaceRole.objects.filter(permissions__icontains=TEMPLATE_KEY_PREFIX):
        perms = role.permissions if isinstance(role.permissions, dict) else None
        if perms is None:
            continue

        keys = perms.get("permission_keys")
        if isinstance(keys, list) and drop_digests_for is not None:
            drop = drop_digests_for({_template_digest(key) for key in keys})
            keys = [key for key in keys if _template_digest(key) not in drop]
        if isinstance(keys, list):
            rewritten = []
            for key in keys:
                rewritten.extend(_rewrite_template_key(key, digest_map))
            perms["permission_keys"] = list(dict.fromkeys(rewritten))

        descriptors = perms.get(DESCRIPTOR_KEY)
        if isinstance(descriptors, dict):
            rewritten = {}
            for key, descriptor in descriptors.items():
                for new_key in _rewrite_template_key(key, digest_map):
                    if new_key == key:
                        rewritten.setdefault(key, descriptor)
                    else:
                        rewritten.setdefault(new_key, descriptor_for(new_key, descriptor))
            perms[DESCRIPTOR_KEY] = rewritten

        role.permissions = perms
        role.save(update_fields=["permissions"])


def forwards(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for name, system_key in LEGACY_NAME_TO_SYSTEM_KEY.items():
            cursor.execute(
                "UPDATE issue_types SET system_key = %s WHERE btrim(name) = %s AND system_key IS NULL",
                [system_key, name],
            )
        cursor.execute(
            "SELECT project_id, system_key, string_agg(name, ' / ') FROM issue_types "
            "WHERE system_key IS NOT NULL AND deleted_at IS NULL "
            "GROUP BY project_id, system_key HAVING count(*) > 1 LIMIT 20"
        )
        collisions = cursor.fetchall()
    if collisions:
        raise RuntimeError(
            "以下项目有两个未删的类型对到同一个系统标识，请先改名或删除其中一个再迁移："
            + "; ".join(f"项目 {p} 的 {k}：{names}" for p, k, names in collisions)
        )

    # 旧摘要（按名字）→ 新摘要（按标识）
    digest_map = {
        _digest(name): [_digest(TEMPLATE_IDENTITY_PREFIX + system_key)]
        for name, system_key in LEGACY_NAME_TO_SYSTEM_KEY.items()
    }
    system_key_by_digest = {
        _digest(TEMPLATE_IDENTITY_PREFIX + key): key for key in SYSTEM_ISSUE_TYPE_NAMES
    }

    def descriptor_for(new_key, descriptor):
        digest, action = new_key[len(TEMPLATE_KEY_PREFIX):].rsplit(".", 1)
        system_key = system_key_by_digest[digest]
        return {"name": SYSTEM_ISSUE_TYPE_NAMES[system_key], "action": action, "system_key": system_key}

    # 同一个标识对应多个名字时（只有 bug：「缺陷」「缺陷(软件)」），模板里只要有现行名字的勾选，
    # 就丢掉其余名字那组，不取并集
    legacy_digests_by_key = {}
    for name, system_key in LEGACY_NAME_TO_SYSTEM_KEY.items():
        if name != SYSTEM_ISSUE_TYPE_NAMES[system_key]:
            legacy_digests_by_key.setdefault(system_key, set()).add(_digest(name))
    current_digest_by_key = {key: _digest(name) for key, name in SYSTEM_ISSUE_TYPE_NAMES.items()}

    def drop_digests_for(present_digests):
        drop = set()
        for system_key, legacy in legacy_digests_by_key.items():
            if current_digest_by_key[system_key] in present_digests:
                drop |= legacy
        return drop

    _rewrite_roles(apps, digest_map, descriptor_for, drop_digests_for)


def backwards(apps, schema_editor):
    # 按标识的一组拆回按名字的几组（bug 拆回「缺陷」「缺陷(软件)」两组），让旧代码按名字下发
    names_by_key = {}
    for name, system_key in LEGACY_NAME_TO_SYSTEM_KEY.items():
        names_by_key.setdefault(system_key, []).append(name)
    digest_map = {
        _digest(TEMPLATE_IDENTITY_PREFIX + system_key): [_digest(name) for name in names]
        for system_key, names in names_by_key.items()
    }
    name_by_digest = {_digest(name): name for name in LEGACY_NAME_TO_SYSTEM_KEY}

    def descriptor_for(new_key, descriptor):
        digest, action = new_key[len(TEMPLATE_KEY_PREFIX):].rsplit(".", 1)
        return {"name": name_by_digest[digest], "action": action}

    _rewrite_roles(apps, digest_map, descriptor_for)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0419_backfill_issue_scheme"),
    ]

    operations = [
        migrations.AddField(
            model_name="issuetype",
            name="system_key",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.AddConstraint(
            model_name="issuetype",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("system_key__isnull", False)),
                fields=("project", "system_key"),
                name="issue_type_unique_project_system_key",
            ),
        ),
    ]
