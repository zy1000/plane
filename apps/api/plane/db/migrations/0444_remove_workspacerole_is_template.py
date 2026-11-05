# 权限组拆成三类的收尾：is_template 已由 kind 取代（0443 已把数据搬过去）。单独一个迁移，避免和数据改写同事务。

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0443_split_permission_group_kinds"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="workspacerole",
            name="is_template",
        ),
    ]
