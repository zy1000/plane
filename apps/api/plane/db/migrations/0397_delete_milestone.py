"""删掉里程碑表（PMS-101：里程碑模块由项目阶段替代，存量数据直接清除）。

不先 RunPython 删行：DROP TABLE 连数据一起走，先 DELETE 反而会撞 pending trigger events
（见 0369 头注）。M2M through 表 ``milestone_issues`` 随 DeleteModel 一起 drop。
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [("db", "0396_project_stage_permissions")]

    operations = [
        migrations.DeleteModel(name="Milestone"),
    ]
