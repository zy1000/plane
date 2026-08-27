from django.db import migrations, models


def assert_wipeable(apps, schema_editor):
    """把「必须为空」从隐式变成显式。

    0316/0317 靠 AddField NOT NULL 与外键在有数据时自然报错；这一版的删表与删列都不会
    因残留行失败，**没有任何东西会自然报错** —— 必须自己检查，否则会静默留下一堆状态列
    与新语义对不上的脏行（比如一条 status=confirmed 却从未通过审批的需求）。

    需求类型（requirement_types / requirement_fields）与标准库结构本身保留 —— 它们不带
    审批语义，重建代价却很高。标准库**条目**也在 requirements 表里，一并保留，只是把
    status 拍回 draft 以满足新的 CheckConstraint。
    """
    Requirement = apps.get_model("db", "Requirement")
    tables = {
        "requirements（产品/项目作用域的行）": Requirement.objects.filter(
            library__isnull=True
        ),
        "requirement_drafts": apps.get_model("db", "RequirementDraft").objects,
        "requirement_draft_rows": apps.get_model("db", "RequirementDraftRow").objects,
        "requirement_change_requests": apps.get_model(
            "db", "RequirementChangeRequest"
        ).objects,
        "requirement_change_items": apps.get_model("db", "RequirementChangeItem").objects,
        "requirement_change_approvals": apps.get_model(
            "db", "RequirementChangeApproval"
        ).objects,
        "requirement_versions": apps.get_model("db", "RequirementVersion").objects,
        "requirement_baselines": apps.get_model("db", "RequirementBaseline").objects,
    }
    dirty = [name for name, manager in tables.items() if manager.exists()]
    if dirty:
        raise RuntimeError(
            "需求审批从「按基线」改成「按条目」，旧数据没有对应的新形态，不做数据迁移。"
            "请先清空以下表再执行：" + "、".join(dirty)
        )


def reset_library_item_status(apps, schema_editor):
    """标准库条目永不走审批，新的 CheckConstraint 要求它们 status 恒为 draft。"""
    Requirement = apps.get_model("db", "Requirement")
    Requirement.objects.filter(library__isnull=False).exclude(status="draft").update(
        status="draft"
    )


class Migration(migrations.Migration):
    """拆掉「基线是变更单位」这套结构。

    删掉：草稿层（requirement_drafts / requirement_draft_rows）、旧的 RequirementBaseline
    （它的审批配置部分在 0320 以 RequirementApprovalPolicy 重建），以及变更单 / 变更项 /
    版本上所有以基线为中心的列。

    与 0320 分开是必须的：0319 要把这些表彻底腾空并删掉，而 0320 才建新模型。混在一个
    迁移里，Django 的操作排序不保证「先删后建」，只会在执行 SQL 时才暴露冲突。
    """

    dependencies = [
        ("db", "0318_requirement_builtin_columns"),
    ]

    operations = [
        migrations.RunPython(assert_wipeable, migrations.RunPython.noop, elidable=False),
        migrations.RunPython(
            reset_library_item_status, migrations.RunPython.noop, elidable=False
        ),
        # 1) 先摘约束与索引，它们引用着待删的列
        migrations.RemoveConstraint(
            model_name="requirementapprover",
            name="req_approver_unique_baseline_approver_active",
        ),
        migrations.RemoveConstraint(
            model_name="requirementchangerequest",
            name="req_change_unique_baseline_sequence_active",
        ),
        migrations.RemoveConstraint(
            model_name="requirementversion",
            name="req_version_unique_target_version_active",
        ),
        migrations.RemoveIndex(
            model_name="requirementchangeitem",
            name="req_change_item_request_kind",
        ),
        migrations.RemoveIndex(
            model_name="requirementchangerequest",
            name="req_change_baseline_created",
        ),
        # 2) 删以基线为中心的列
        migrations.RemoveField(model_name="requirement", name="last_changed_version"),
        migrations.RemoveField(model_name="requirementapprover", name="baseline"),
        migrations.RemoveField(model_name="requirementchangeitem", name="target_kind"),
        migrations.RemoveField(model_name="requirementchangerequest", name="base_version"),
        migrations.RemoveField(model_name="requirementchangerequest", name="baseline"),
        migrations.RemoveField(
            model_name="requirementchangerequest", name="proposed_fields"
        ),
        migrations.RemoveField(model_name="requirementchangerequest", name="request_kind"),
        migrations.RemoveField(model_name="requirementchangerequest", name="target_kind"),
        migrations.RemoveField(model_name="requirementversion", name="baseline"),
        migrations.RemoveField(model_name="requirementversion", name="target_kind"),
        # 3) 拆草稿层与旧基线（先摘外键再 DeleteModel，顺序不能反）
        migrations.RemoveField(model_name="requirementdraftrow", name="assignee"),
        migrations.RemoveField(model_name="requirementdraftrow", name="created_by"),
        migrations.RemoveField(model_name="requirementdraftrow", name="draft"),
        migrations.RemoveField(model_name="requirementdraftrow", name="parent"),
        migrations.RemoveField(
            model_name="requirementdraftrow", name="requirement_type"
        ),
        migrations.RemoveField(model_name="requirementdraftrow", name="updated_by"),
        migrations.RemoveField(model_name="requirementdraft", name="baseline"),
        migrations.RemoveField(model_name="requirementdraft", name="created_by"),
        migrations.RemoveField(model_name="requirementdraft", name="product"),
        migrations.RemoveField(model_name="requirementdraft", name="project"),
        migrations.RemoveField(model_name="requirementdraft", name="updated_by"),
        migrations.RemoveField(model_name="requirementdraft", name="workspace"),
        migrations.RemoveField(model_name="requirementbaseline", name="created_by"),
        migrations.RemoveField(model_name="requirementbaseline", name="owner"),
        migrations.RemoveField(model_name="requirementbaseline", name="product"),
        migrations.RemoveField(model_name="requirementbaseline", name="project"),
        migrations.RemoveField(model_name="requirementbaseline", name="updated_by"),
        migrations.RemoveField(model_name="requirementbaseline", name="workspace"),
        migrations.DeleteModel(name="RequirementDraftRow"),
        migrations.DeleteModel(name="RequirementDraft"),
        migrations.DeleteModel(name="RequirementBaseline"),
        # 4) requirements 的 status 收缩取值（去掉 in_review —— 评审是另一根轴）
        migrations.AlterField(
            model_name="requirement",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "草稿"),
                    ("confirmed", "已确认"),
                    ("implemented", "已实现"),
                    ("obsolete", "已废弃"),
                ],
                db_index=True,
                default="draft",
                max_length=30,
                verbose_name="需求状态",
            ),
        ),
    ]
