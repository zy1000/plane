from django.db import migrations


def migrate_issue_state_to_issue_type(apps, schema_editor):
    """
    将工作项的 state 从旧的项目级状态（issue_type 为空）
    更新为对应 issue_type 下的新状态（由 0195 迁移复制而来）。
    """
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE issues i
            SET state_id = new_state.id
            FROM (
                SELECT
                    old_s.id  AS old_state_id,
                    new_s.id  AS id,
                    new_s.project_id,
                    new_s.issue_type_id
                FROM states old_s
                JOIN states new_s
                    ON  new_s.project_id    = old_s.project_id
                    AND new_s.name          = old_s.name
                    AND new_s.issue_type_id IS NOT NULL
                    AND new_s.deleted_at    IS NULL
                WHERE old_s.issue_type_id IS NULL
                  AND old_s.deleted_at    IS NULL
            ) new_state
            WHERE i.state_id    = new_state.old_state_id
              AND i.type_id     = new_state.issue_type_id
              AND i.deleted_at  IS NULL
            """
        )


def reverse_migrate_issue_state_to_issue_type(apps, schema_editor):
    """
    回滚：将工作项的 state 还原为对应的项目级状态（issue_type 为空）。
    """
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE issues i
            SET state_id = old_state.id
            FROM (
                SELECT
                    new_s.id  AS new_state_id,
                    old_s.id  AS id,
                    old_s.project_id
                FROM states new_s
                JOIN states old_s
                    ON  old_s.project_id    = new_s.project_id
                    AND old_s.name          = new_s.name
                    AND old_s.issue_type_id IS NULL
                    AND old_s.deleted_at    IS NULL
                WHERE new_s.issue_type_id IS NOT NULL
                  AND new_s.deleted_at    IS NULL
            ) old_state
            WHERE i.state_id   = old_state.new_state_id
              AND i.deleted_at IS NULL
            """
        )


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0198_alter_issuetransitionapprovalrecord_comment'),
    ]

    operations = [
        migrations.RunPython(
            migrate_issue_state_to_issue_type,
            reverse_migrate_issue_state_to_issue_type,
        ),
    ]
