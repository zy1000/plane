"""预置研发模式「混合模式」改名为「混合模型」。

``default_dev_mode`` 与创建项目弹窗都按 ``DEFAULT_DEV_MODE_NAME`` 找默认模式，常量改了，
存量行必须同步改名，否则老工作区找不到默认模式。只动 ``is_system`` 的预置行；
同工作区已有一个未删的「混合模型」时跳过，免得撞 (workspace, name) 唯一约束。
名字写成字面量：迁移要固定在当时的取值，不跟着常量走。
"""

from django.db import migrations

OLD_NAME = "混合模式"
NEW_NAME = "混合模型"


def _rename(apps, old_name, new_name):
    DevMode = apps.get_model("db", "DevMode")
    taken = DevMode.objects.filter(name=new_name, deleted_at__isnull=True).values(
        "workspace_id"
    )
    DevMode.objects.filter(is_system=True, name=old_name).exclude(
        workspace_id__in=taken
    ).update(name=new_name)


def forwards(apps, schema_editor):
    _rename(apps, OLD_NAME, NEW_NAME)


def backwards(apps, schema_editor):
    _rename(apps, NEW_NAME, OLD_NAME)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0413_department_user_extra_info_leader"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
