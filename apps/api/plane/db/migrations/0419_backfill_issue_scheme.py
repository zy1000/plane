"""工作项方案批次 1 的回填（docs/issue-scheme/issue-scheme-execution-plan.md）。

1. 每个研发模式建一个空的模式方案（内容在批次 4 生成）。
2. 每个项目建一个项目方案，把它名下五张表的行归进去。**不改任何工作项**：
   类型 / 状态 / 字段 / 工作流的 id 都不变，只是多了 scheme 这一列。
   软删的项目，方案也带上同一个 deleted_at。
3. 校验：五张表、项目、模式的方案列全部非空，否则中止。

审批人的 workspace_role 不回填：项目方案的角色审批人照旧只用 role，这一列留给批次 4 的模式方案。

回填必须覆盖**全部**行：软删的、模板项目（``is_template=True``）都要有值。
历史模型的默认管理器是裸 Manager（SoftDeletionManager 没设 use_in_migrations），
``objects.all()`` 正好是全量。五张表用 UPDATE ... FROM 一条语句回填，不逐行 save。

发布注意：先把 Celery worker 换成新代码再跑本迁移。老代码建的类型 / 状态不写 scheme，
校验之后插进来的行会漏。
"""

from django.db import migrations

BATCH_SIZE = 2000

#: 五张挂到方案下的表（都有 project_id 列）
SCHEME_TABLES = (
    "issue_types",
    "type_extra_fields",
    "states",
    "workflows",
    "workflow_transitions",
)


def backfill_issue_scheme(apps, schema_editor):
    IssueScheme = apps.get_model("db", "IssueScheme")
    DevMode = apps.get_model("db", "DevMode")
    Project = apps.get_model("db", "Project")

    # 1) 模式方案
    dev_modes = list(DevMode.objects.filter(issue_scheme__isnull=True).only("id", "workspace_id", "name"))
    schemes = [IssueScheme(workspace_id=m.workspace_id, name=m.name) for m in dev_modes]
    IssueScheme.objects.bulk_create(schemes, batch_size=BATCH_SIZE)
    for mode, scheme in zip(dev_modes, schemes):
        mode.issue_scheme_id = scheme.id
    DevMode.objects.bulk_update(dev_modes, ["issue_scheme"], batch_size=BATCH_SIZE)

    # 2) 项目方案
    projects = list(
        Project.objects.filter(issue_scheme__isnull=True).only("id", "workspace_id", "name", "deleted_at")
    )
    schemes = [
        IssueScheme(workspace_id=p.workspace_id, name=p.name, project_id=p.id, deleted_at=p.deleted_at)
        for p in projects
    ]
    IssueScheme.objects.bulk_create(schemes, batch_size=BATCH_SIZE)
    for project, scheme in zip(projects, schemes):
        project.issue_scheme_id = scheme.id
    Project.objects.bulk_update(projects, ["issue_scheme"], batch_size=BATCH_SIZE)

    with schema_editor.connection.cursor() as cursor:
        for table in SCHEME_TABLES:
            cursor.execute(
                f"UPDATE {table} t SET scheme_id = p.issue_scheme_id "
                f"FROM projects p WHERE t.project_id = p.id AND t.scheme_id IS NULL"
            )

        # 3) 校验
        missing = {}
        for table in SCHEME_TABLES:
            cursor.execute(f"SELECT count(*) FROM {table} WHERE scheme_id IS NULL")
            missing[table] = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM projects WHERE issue_scheme_id IS NULL")
        missing["projects"] = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM dev_modes WHERE issue_scheme_id IS NULL")
        missing["dev_modes"] = cursor.fetchone()[0]
        # 行的 scheme 必须等于其项目的 issue_scheme（同一条 UPDATE 写的，这里防有人半路改过）
        for table in SCHEME_TABLES:
            cursor.execute(
                f"SELECT count(*) FROM {table} t JOIN projects p ON p.id = t.project_id "
                f"WHERE t.scheme_id <> p.issue_scheme_id"
            )
            mismatched = cursor.fetchone()[0]
            if mismatched:
                missing[f"{table}(scheme≠项目方案)"] = mismatched

    bad = {k: v for k, v in missing.items() if v}
    if bad:
        raise RuntimeError(f"工作项方案回填不完整，中止：{bad}")


def unbackfill_issue_scheme(apps, schema_editor):
    # 清掉所有引用再删方案，让 0418 的 RemoveField / DeleteModel 能回退
    with schema_editor.connection.cursor() as cursor:
        for table in SCHEME_TABLES:
            cursor.execute(f"UPDATE {table} SET scheme_id = NULL")
        cursor.execute("UPDATE projects SET issue_scheme_id = NULL")
        cursor.execute("UPDATE dev_modes SET issue_scheme_id = NULL")
        cursor.execute("DELETE FROM issue_schemes")


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0418_issue_scheme"),
    ]

    operations = [
        migrations.RunPython(backfill_issue_scheme, unbackfill_issue_scheme),
    ]
