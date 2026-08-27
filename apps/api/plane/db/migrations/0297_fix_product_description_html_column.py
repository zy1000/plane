from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0296_fileasset_product"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        DO $migration$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM information_schema.columns
                                WHERE table_schema = current_schema()
                                  AND table_name = 'products'
                                  AND column_name = 'description_html'
                                  AND udt_name = 'jsonb'
                            ) THEN
                                ALTER TABLE products
                                ALTER COLUMN description_html TYPE text
                                USING CASE
                                    WHEN description_html IS NULL THEN NULL
                                    WHEN jsonb_typeof(description_html) = 'string'
                                        THEN description_html #>> '{}'
                                    ELSE description_html::text
                                END;
                            END IF;
                        END
                        $migration$;
                    """,
                    reverse_sql="""
                        DO $migration$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM information_schema.columns
                                WHERE table_schema = current_schema()
                                  AND table_name = 'products'
                                  AND column_name = 'description_html'
                                  AND udt_name = 'text'
                            ) THEN
                                ALTER TABLE products
                                ALTER COLUMN description_html TYPE jsonb
                                USING CASE
                                    WHEN description_html IS NULL THEN NULL
                                    ELSE to_jsonb(description_html)
                                END;
                            END IF;
                        END
                        $migration$;
                    """,
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name="product",
                    name="description_html",
                    field=models.TextField(
                        blank=True,
                        null=True,
                        verbose_name="Product Description HTML",
                    ),
                ),
            ],
        ),
    ]
