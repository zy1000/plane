from django.db import migrations


def backfill_owner_membership(apps, schema_editor):
    """存量产品的负责人补进成员表。

    负责人以前不落 ProductMember，成员表可能整个是空的；新的 validate_owner
    要求负责人必须是产品成员，不补的话老产品一改就 400。
    """
    Product = apps.get_model("db", "Product")
    ProductMember = apps.get_model("db", "ProductMember")

    existing = set(ProductMember.objects.values_list("product_id", "member_id"))
    rows = [
        ProductMember(product_id=product_id, member_id=owner_id)
        for product_id, owner_id in Product.objects.filter(
            deleted_at__isnull=True, owner_id__isnull=False
        ).values_list("id", "owner_id")
        if (product_id, owner_id) not in existing
    ]
    ProductMember.objects.bulk_create(rows, batch_size=500)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0343_requirementtype_builtin_field_layout"),
    ]

    operations = [
        migrations.RunPython(backfill_owner_membership, migrations.RunPython.noop),
    ]
