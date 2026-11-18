# 上游「项目模块」下线：把全部研发模式与项目的模块开关关掉。
#
# 只关开关，模块 / 模块工作项的表和数据原样保留。反向不恢复：要重新启用，
# 在研发模式和项目的功能开关里打开即可。

from django.db import migrations


def disable_module_view(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    DevMode = apps.get_model("db", "DevMode")

    # 历史模型的管理器不过滤软删行，软删项目与模板项目也一并关掉
    Project.objects.filter(module_view=True).update(module_view=False)

    # features 缺 module_view 时按「开」解释（normalize_features），所以要显式写 False
    for dev_mode in DevMode.objects.all().only("id", "features"):
        features = dict(dev_mode.features or {})
        if features.get("module_view", True):
            features["module_view"] = False
            DevMode.objects.filter(pk=dev_mode.pk).update(features=features)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0006_requirement_field_definitions"),
    ]

    operations = [
        migrations.RunPython(disable_module_view, migrations.RunPython.noop),
    ]
