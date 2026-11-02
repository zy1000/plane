from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0435_case_product_template"),
    ]

    operations = [
        # 存量文件全部算小网
        migrations.AddField(
            model_name="fileasset",
            name="network_zone",
            field=models.CharField(
                choices=[("wan", "大网"), ("lan", "小网")],
                default="lan",
                max_length=8,
            ),
            preserve_default=False,
        ),
        # 之后新建的行由 save() 按上传人归属填，模型默认值是空串
        migrations.AlterField(
            model_name="fileasset",
            name="network_zone",
            field=models.CharField(
                choices=[("wan", "大网"), ("lan", "小网")],
                default="",
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="network_zone",
            field=models.CharField(
                blank=True,
                choices=[("wan", "大网"), ("lan", "小网")],
                max_length=8,
                null=True,
            ),
        ),
    ]
