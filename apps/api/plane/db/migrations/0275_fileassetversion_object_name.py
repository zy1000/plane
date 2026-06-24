from django.db import migrations, models


def backfill_version_object_name(apps, schema_editor):
    FileAssetVersion = apps.get_model("db", "FileAssetVersion")
    db_alias = schema_editor.connection.alias
    from plane.utils.file_path import compute_storage_key

    versions = (
        FileAssetVersion.objects.using(db_alias)
        .filter(object_name="")
        .select_related("asset")
        .iterator(chunk_size=500)
    )
    for version in versions:
        asset = version.asset
        if not asset:
            continue
        object_name = compute_storage_key(asset)
        if not object_name:
            continue
        version.object_name = object_name
        version.save(update_fields=["object_name"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0274_file_asset_versions_enable_uploads_versioning"),
    ]

    operations = [
        migrations.AddField(
            model_name="fileassetversion",
            name="object_name",
            field=models.CharField(blank=True, default="", max_length=1024),
        ),
        migrations.RunPython(backfill_version_object_name, noop_reverse),
    ]
