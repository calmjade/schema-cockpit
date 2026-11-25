import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateCodeArtifacts } from './codegen.js';
import { executeRun, getDb, persistDb, queryAll, queryOne, recordAuditLog } from './db.js';
import type { AuditLog, Project, Requirement, SchemaColumn, SchemaTable } from './types.js';

const createProjectSchema = z.object({
  name: z.string().min(1, '项目名称不能为空').max(100),
  code: z.string().min(2, '项目编码不能为空').max(40),
  tech_stack: z.string().min(1, '技术栈不能为空').max(200),
  owner: z.string().min(1).max(60).default('曹杰'),
  env_status: z.string().min(1).max(40).default('联调测试'),
  description: z.string().max(500).default(''),
});

const createTableSchema = z.object({
  project_id: z.number().int().positive(),
  table_name: z.string().min(1, '表名不能为空').max(80).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, '表名仅支持字母、数字与下划线'),
  comment: z.string().max(200).default(''),
  engine: z.string().max(32).default('InnoDB'),
  module: z.string().max(64).default('核心域'),
});

const updateTableSchema = z.object({
  table_name: z.string().min(1).max(80).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).optional(),
  comment: z.string().max(200).optional(),
  engine: z.string().max(32).optional(),
  module: z.string().max(64).optional(),
  project_id: z.number().int().positive().optional(),
});

const columnInputSchema = z.object({
  name: z.string().min(1, '字段名不能为空').max(80).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, '字段名仅支持字母、数字与下划线'),
  data_type: z.string().min(1).max(40),
  length: z.string().max(24).default(''),
  is_pk: z.union([z.number().int().min(0).max(1), z.boolean()]).transform((v) => (v ? 1 : 0)),
  is_nullable: z.union([z.number().int().min(0).max(1), z.boolean()]).transform((v) => (v ? 1 : 0)),
  default_val: z.string().max(120).default(''),
  index_type: z.enum(['NONE', 'PRIMARY', 'UNIQUE', 'INDEX']).default('NONE'),
  comment: z.string().max(255).default(''),
  ref_table: z.string().max(80).default(''),
  sort_order: z.number().int().optional(),
});

const saveColumnsSchema = z.object({
  columns: z.array(columnInputSchema).min(1, '至少保留一个字段'),
});

const createRequirementSchema = z.object({
  project_id: z.number().int().positive(),
  code: z.string().min(1).max(40).optional(),
  title: z.string().min(1, '需求标题不能为空').max(200),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).default('P1'),
  status: z.enum(['待评审', '开发中', '联调中', '已上线']).default('待评审'),
  impacted_tables: z.array(z.string()).default([]),
  assignee: z.string().min(1).max(60).default('曹杰'),
  target_version: z.string().min(1).max(40).default('v1.0.0'),
  description: z.string().max(1000).default(''),
});

const updateRequirementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
  status: z.enum(['待评审', '开发中', '联调中', '已上线']).optional(),
  impacted_tables: z.array(z.string()).optional(),
  assignee: z.string().min(1).max(60).optional(),
  target_version: z.string().min(1).max(40).optional(),
  description: z.string().max(1000).optional(),
});

function nowString(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function parseRequirementRow(row: Record<string, unknown>): Requirement {
  let impacted: string[] = [];
  if (typeof row.impacted_tables === 'string') {
    try {
      const parsed = JSON.parse(row.impacted_tables);
      if (Array.isArray(parsed)) impacted = parsed.map(String);
    } catch {
      impacted = [];
    }
  }
  return {
    id: Number(row.id),
    project_id: Number(row.project_id),
    code: String(row.code),
    title: String(row.title),
    priority: String(row.priority),
    status: String(row.status) as Requirement['status'],
    impacted_tables: impacted,
    assignee: String(row.assignee),
    target_version: String(row.target_version),
    description: String(row.description),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    const pCount = Number(queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM projects')?.c ?? 0);
    const tCount = Number(queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM schema_tables')?.c ?? 0);
    const cCount = Number(queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM schema_columns')?.c ?? 0);
    return {
      status: 'UP',
      service: 'schema-cockpit',
      projects: pCount,
      tables: tCount,
      columns: cCount,
    };
  });

  app.get('/api/dashboard', async () => {
    const projectCount = Number(queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM projects')?.c ?? 0);
    const tableCount = Number(queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM schema_tables')?.c ?? 0);
    const columnCount = Number(queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM schema_columns')?.c ?? 0);
    const requirementCount = Number(queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM requirements')?.c ?? 0);
    const relationCount = Number(
      queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM schema_columns WHERE ref_table IS NOT NULL AND ref_table != ''")?.c ?? 0
    );

    const statusRows = queryAll<{ status: string; count: number }>(
      'SELECT status, COUNT(*) AS count FROM requirements GROUP BY status'
    );
    const requirementStatusDist: Record<string, number> = {
      待评审: 0,
      开发中: 0,
      联调中: 0,
      已上线: 0,
    };
    for (const row of statusRows) {
      requirementStatusDist[row.status] = Number(row.count);
    }

    const projectBreakdown = queryAll<{
      id: number;
      name: string;
      code: string;
      env_status: string;
      table_count: number;
      column_count: number;
    }>(
      `SELECT p.id, p.name, p.code, p.env_status,
              COUNT(DISTINCT t.id) AS table_count,
              COUNT(c.id) AS column_count
       FROM projects p
       LEFT JOIN schema_tables t ON t.project_id = p.id
       LEFT JOIN schema_columns c ON c.table_id = t.id
       GROUP BY p.id
       ORDER BY p.id ASC`
    );

    const recentAuditLogs = queryAll<AuditLog>(
      'SELECT * FROM audit_logs ORDER BY id DESC LIMIT 12'
    );

    return {
      projectCount,
      tableCount,
      columnCount,
      requirementCount,
      relationCount,
      requirementStatusDist,
      projectBreakdown,
      recentAuditLogs,
    };
  });

  app.get('/api/projects', async () => {
    const projects = queryAll<Project & { table_count: number }>(
      `SELECT p.*, COUNT(t.id) AS table_count
       FROM projects p
       LEFT JOIN schema_tables t ON t.project_id = p.id
       GROUP BY p.id
       ORDER BY p.id ASC`
    );
    return { items: projects };
  });

  app.post('/api/projects', async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: '参数校验失败', issues: parsed.error.issues });
    }
    const data = parsed.data;
    const dup = queryOne<{ id: number }>('SELECT id FROM projects WHERE code = ?', [data.code]);
    if (dup) {
      return reply.status(409).send({ error: `项目编码 ${data.code} 已存在` });
    }
    const now = nowString();
    const res = executeRun(
      `INSERT INTO projects (name, code, tech_stack, owner, env_status, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.code, data.tech_stack, data.owner, data.env_status, data.description, now]
    );
    recordAuditLog('PROJECT', res.lastInsertId, 'CREATE_PROJECT', data.name, `创建项目 ${data.name} (${data.code})`, data.owner);
    const created = queryOne<Project>('SELECT * FROM projects WHERE id = ?', [res.lastInsertId]);
    return reply.status(201).send(created);
  });

  app.get('/api/tables', async (request) => {
    const query = request.query as { projectId?: string; q?: string };
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query.projectId && query.projectId !== 'all') {
      conditions.push('t.project_id = ?');
      params.push(Number(query.projectId));
    }
    if (query.q && query.q.trim()) {
      conditions.push('(t.table_name LIKE ? OR t.comment LIKE ? OR t.module LIKE ?)');
      const like = `%${query.q.trim()}%`;
      params.push(like, like, like);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const tables = queryAll<SchemaTable & { project_name: string; project_code: string }>(
      `SELECT t.*, p.name AS project_name, p.code AS project_code
       FROM schema_tables t
       JOIN projects p ON p.id = t.project_id
       ${whereSql}
       ORDER BY t.project_id ASC, t.id ASC`,
      params
    );

    const allCols = queryAll<SchemaColumn>('SELECT * FROM schema_columns ORDER BY sort_order ASC, id ASC');
    const colMap = new Map<number, SchemaColumn[]>();
    for (const col of allCols) {
      const list = colMap.get(col.table_id) ?? [];
      list.push(col);
      colMap.set(col.table_id, list);
    }

    const enriched = tables.map((t) => ({
      ...t,
      columns: colMap.get(t.id) ?? [],
    }));
    return { items: enriched };
  });

  app.get('/api/tables/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const table = queryOne<SchemaTable & { project_name: string }>(
      `SELECT t.*, p.name AS project_name
       FROM schema_tables t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`,
      [Number(id)]
    );
    if (!table) {
      return reply.status(404).send({ error: '数据表不存在' });
    }
    const columns = queryAll<SchemaColumn>(
      'SELECT * FROM schema_columns WHERE table_id = ? ORDER BY sort_order ASC, id ASC',
      [table.id]
    );
    return { ...table, columns };
  });

  app.post('/api/tables', async (request, reply) => {
    const parsed = createTableSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: '参数校验失败', issues: parsed.error.issues });
    }
    const data = parsed.data;
    const project = queryOne<Project>('SELECT * FROM projects WHERE id = ?', [data.project_id]);
    if (!project) {
      return reply.status(404).send({ error: '所属项目不存在' });
    }
    const dup = queryOne<{ id: number }>(
      'SELECT id FROM schema_tables WHERE project_id = ? AND table_name = ?',
      [data.project_id, data.table_name]
    );
    if (dup) {
      return reply.status(409).send({ error: `项目内已存在同名表 ${data.table_name}` });
    }

    const now = nowString();
    const res = executeRun(
      `INSERT INTO schema_tables (project_id, table_name, comment, engine, module, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.project_id, data.table_name, data.comment, data.engine, data.module, now, now]
    );

    // Seed default id & created_at columns for immediate usability
    const db = getDb();
    const defaultCols = [
      ['id', 'BIGINT', '20', 1, 0, 'AUTO_INCREMENT', 'PRIMARY', '主键ID', '', 1],
      ['created_at', 'DATETIME', '', 0, 0, 'CURRENT_TIMESTAMP', 'NONE', '创建时间', '', 2],
    ] as const;
    for (const c of defaultCols) {
      const stmt = db.prepare(
        `INSERT INTO schema_columns (table_id, name, data_type, length, is_pk, is_nullable, default_val, index_type, comment, ref_table, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      stmt.bind([res.lastInsertId, ...c]);
      stmt.step();
      stmt.free();
    }
    persistDb();

    recordAuditLog(
      'TABLE',
      res.lastInsertId,
      'CREATE_TABLE',
      data.table_name,
      `在项目【${project.name}】中新建数据表 ${data.table_name} (${data.comment || '无备注'})`
    );

    const created = queryOne<SchemaTable>('SELECT * FROM schema_tables WHERE id = ?', [res.lastInsertId]);
    const columns = queryAll<SchemaColumn>('SELECT * FROM schema_columns WHERE table_id = ? ORDER BY sort_order ASC', [
      res.lastInsertId,
    ]);
    return reply.status(201).send({ ...created, columns });
  });

  app.put('/api/tables/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tableId = Number(id);
    const existing = queryOne<SchemaTable>('SELECT * FROM schema_tables WHERE id = ?', [tableId]);
    if (!existing) {
      return reply.status(404).send({ error: '数据表不存在' });
    }
    const parsed = updateTableSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: '参数校验失败', issues: parsed.error.issues });
    }
    const data = parsed.data;
    const nextTableName = data.table_name ?? existing.table_name;
    const nextComment = data.comment ?? existing.comment;
    const nextEngine = data.engine ?? existing.engine;
    const nextModule = data.module ?? existing.module;
    const nextProjectId = data.project_id ?? existing.project_id;
    const now = nowString();

    executeRun(
      `UPDATE schema_tables
       SET project_id = ?, table_name = ?, comment = ?, engine = ?, module = ?, updated_at = ?
       WHERE id = ?`,
      [nextProjectId, nextTableName, nextComment, nextEngine, nextModule, now, tableId]
    );
    recordAuditLog(
      'TABLE',
      tableId,
      'UPDATE_TABLE',
      nextTableName,
      `更新表元信息：模块=${nextModule}，引擎=${nextEngine}，备注=${nextComment}`
    );

    const updated = queryOne<SchemaTable>('SELECT * FROM schema_tables WHERE id = ?', [tableId]);
    const columns = queryAll<SchemaColumn>('SELECT * FROM schema_columns WHERE table_id = ? ORDER BY sort_order ASC', [tableId]);
    return { ...updated, columns };
  });

  app.delete('/api/tables/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tableId = Number(id);
    const existing = queryOne<SchemaTable>('SELECT * FROM schema_tables WHERE id = ?', [tableId]);
    if (!existing) {
      return reply.status(404).send({ error: '数据表不存在' });
    }
    executeRun('DELETE FROM schema_columns WHERE table_id = ?', [tableId]);
    executeRun('DELETE FROM schema_tables WHERE id = ?', [tableId]);
    recordAuditLog('TABLE', tableId, 'DELETE_TABLE', existing.table_name, `删除数据表 ${existing.table_name}`);
    return { deleted: true, id: tableId };
  });

  app.post('/api/tables/:id/columns', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tableId = Number(id);
    const table = queryOne<SchemaTable>('SELECT * FROM schema_tables WHERE id = ?', [tableId]);
    if (!table) {
      return reply.status(404).send({ error: '数据表不存在' });
    }

    const parsed = saveColumnsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: '字段定义校验失败', issues: parsed.error.issues });
    }

    const db = getDb();
    const delStmt = db.prepare('DELETE FROM schema_columns WHERE table_id = ?');
    delStmt.bind([tableId]);
    delStmt.step();
    delStmt.free();

    parsed.data.columns.forEach((col, idx) => {
      const stmt = db.prepare(
        `INSERT INTO schema_columns
         (table_id, name, data_type, length, is_pk, is_nullable, default_val, index_type, comment, ref_table, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      stmt.bind([
        tableId,
        col.name,
        col.data_type.toUpperCase(),
        col.length,
        col.is_pk,
        col.is_nullable,
        col.default_val,
        col.is_pk ? 'PRIMARY' : col.index_type,
        col.comment,
        col.ref_table,
        col.sort_order ?? idx + 1,
      ]);
      stmt.step();
      stmt.free();
    });

    const now = nowString();
    const updStmt = db.prepare('UPDATE schema_tables SET updated_at = ? WHERE id = ?');
    updStmt.bind([now, tableId]);
    updStmt.step();
    updStmt.free();
    persistDb();

    recordAuditLog(
      'COLUMN',
      tableId,
      'SAVE_COLUMNS',
      table.table_name,
      `保存表 ${table.table_name} 的字段定义，共 ${parsed.data.columns.length} 个字段`
    );

    const savedCols = queryAll<SchemaColumn>(
      'SELECT * FROM schema_columns WHERE table_id = ? ORDER BY sort_order ASC, id ASC',
      [tableId]
    );
    return { table_id: tableId, columns: savedCols };
  });

  app.get('/api/search', async (request) => {
    const query = request.query as { q?: string };
    const keyword = (query.q ?? '').trim();
    if (!keyword) {
      return { tables: [], columns: [] };
    }
    const like = `%${keyword}%`;

    const matchedTables = queryAll<
      SchemaTable & { project_name: string; project_code: string; column_count: number }
    >(
      `SELECT t.*, p.name AS project_name, p.code AS project_code,
              (SELECT COUNT(*) FROM schema_columns sc WHERE sc.table_id = t.id) AS column_count
       FROM schema_tables t
       JOIN projects p ON p.id = t.project_id
       WHERE t.table_name LIKE ? OR t.comment LIKE ? OR t.module LIKE ?
       ORDER BY t.id ASC
       LIMIT 30`,
      [like, like, like]
    );

    const matchedColumns = queryAll<
      SchemaColumn & { table_name: string; table_comment: string; project_id: number; project_name: string; project_code: string }
    >(
      `SELECT c.*, t.table_name, t.comment AS table_comment, t.project_id, p.name AS project_name, p.code AS project_code
       FROM schema_columns c
       JOIN schema_tables t ON t.id = c.table_id
       JOIN projects p ON p.id = t.project_id
       WHERE c.name LIKE ? OR c.comment LIKE ? OR c.ref_table LIKE ?
       ORDER BY t.project_id ASC, c.table_id ASC, c.sort_order ASC
       LIMIT 60`,
      [like, like, like]
    );

    return { tables: matchedTables, columns: matchedColumns };
  });

  app.get('/api/tables/:id/codegen', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tableId = Number(id);
    const table = queryOne<SchemaTable>('SELECT * FROM schema_tables WHERE id = ?', [tableId]);
    if (!table) {
      return reply.status(404).send({ error: '数据表不存在' });
    }
    const columns = queryAll<SchemaColumn>(
      'SELECT * FROM schema_columns WHERE table_id = ? ORDER BY sort_order ASC, id ASC',
      [tableId]
    );
    const artifacts = generateCodeArtifacts(table, columns);
    return { table, columns, artifacts };
  });

  app.get('/api/er-graph', async (request) => {
    const query = request.query as { projectId?: string };
    const filterByProject = Boolean(query.projectId && query.projectId !== 'all');
    const projectIdNum = filterByProject ? Number(query.projectId) : null;

    const tables = filterByProject
      ? queryAll<SchemaTable & { project_name: string; project_code: string }>(
          `SELECT t.*, p.name AS project_name, p.code AS project_code
           FROM schema_tables t
           JOIN projects p ON p.id = t.project_id
           WHERE t.project_id = ?
           ORDER BY t.id ASC`,
          [projectIdNum!]
        )
      : queryAll<SchemaTable & { project_name: string; project_code: string }>(
          `SELECT t.*, p.name AS project_name, p.code AS project_code
           FROM schema_tables t
           JOIN projects p ON p.id = t.project_id
           ORDER BY t.project_id ASC, t.id ASC`
        );

    const allTablesLookup = queryAll<SchemaTable & { project_name: string; project_code: string }>(
      `SELECT t.*, p.name AS project_name, p.code AS project_code
       FROM schema_tables t
       JOIN projects p ON p.id = t.project_id`
    );
    const tableByName = new Map(allTablesLookup.map((t) => [t.table_name, t]));
    const includedNames = new Set(tables.map((t) => t.table_name));

    const allCols = queryAll<SchemaColumn>('SELECT * FROM schema_columns ORDER BY sort_order ASC, id ASC');
    const colsByTable = new Map<number, SchemaColumn[]>();
    for (const c of allCols) {
      const list = colsByTable.get(c.table_id) ?? [];
      list.push(c);
      colsByTable.set(c.table_id, list);
    }

    // Include cross-project referenced tables (e.g. usr_account) so edges always have both endpoints
    const extraTables: Array<SchemaTable & { project_name: string; project_code: string }> = [];
    for (const t of tables) {
      const cols = colsByTable.get(t.id) ?? [];
      for (const col of cols) {
        if (col.ref_table && !includedNames.has(col.ref_table)) {
          const target = tableByName.get(col.ref_table);
          if (target) {
            includedNames.add(target.table_name);
            extraTables.push(target);
          }
        }
      }
    }

    const finalTables = [...tables, ...extraTables];

    const nodes = finalTables.map((t, index) => {
      const cols = colsByTable.get(t.id) ?? [];
      const colIdx = index % 3;
      const rowIdx = Math.floor(index / 3);
      return {
        id: t.id,
        table_name: t.table_name,
        comment: t.comment,
        module: t.module,
        project_id: t.project_id,
        project_name: t.project_name,
        project_code: t.project_code,
        x: 60 + colIdx * 360,
        y: 50 + rowIdx * 340,
        columns: cols,
      };
    });

    const nodeIdByName = new Map(nodes.map((n) => [n.table_name, n.id]));
    const edges: Array<{
      id: string;
      source_table_id: number;
      source_table: string;
      source_column: string;
      target_table_id: number;
      target_table: string;
      label: string;
    }> = [];

    for (const node of nodes) {
      for (const col of node.columns) {
        if (col.ref_table && nodeIdByName.has(col.ref_table)) {
          const targetId = nodeIdByName.get(col.ref_table)!;
          edges.push({
            id: `${node.id}:${col.name}->${targetId}`,
            source_table_id: node.id,
            source_table: node.table_name,
            source_column: col.name,
            target_table_id: targetId,
            target_table: col.ref_table,
            label: `${col.name} → ${col.ref_table}`,
          });
        }
      }
    }

    return { nodes, edges };
  });

  app.get('/api/requirements', async (request) => {
    const query = request.query as { projectId?: string; status?: string };
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query.projectId && query.projectId !== 'all') {
      conditions.push('r.project_id = ?');
      params.push(Number(query.projectId));
    }
    if (query.status && query.status !== 'all') {
      conditions.push('r.status = ?');
      params.push(query.status);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = queryAll<Record<string, unknown>>(
      `SELECT r.*, p.name AS project_name, p.code AS project_code
       FROM requirements r
       JOIN projects p ON p.id = r.project_id
       ${whereSql}
       ORDER BY r.id DESC`,
      params
    );

    const items = rows.map((row) => ({
      ...parseRequirementRow(row),
      project_name: String(row.project_name),
      project_code: String(row.project_code),
    }));
    return { items };
  });

  app.post('/api/requirements', async (request, reply) => {
    const parsed = createRequirementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: '参数校验失败', issues: parsed.error.issues });
    }
    const data = parsed.data;
    const project = queryOne<Project>('SELECT * FROM projects WHERE id = ?', [data.project_id]);
    if (!project) {
      return reply.status(404).send({ error: '所属项目不存在' });
    }

    const countRow = queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM requirements');
    const autoCode = data.code ?? `REQ-2026-${String(Number(countRow?.c ?? 0) + 101).padStart(3, '0')}`;
    const now = nowString();

    const res = executeRun(
      `INSERT INTO requirements
       (project_id, code, title, priority, status, impacted_tables, assignee, target_version, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.project_id,
        autoCode,
        data.title,
        data.priority,
        data.status,
        JSON.stringify(data.impacted_tables),
        data.assignee,
        data.target_version,
        data.description,
        now,
        now,
      ]
    );

    recordAuditLog(
      'REQUIREMENT',
      res.lastInsertId,
      'CREATE_REQUIREMENT',
      autoCode,
      `新增研发需求【${data.title}】，状态：${data.status}，影响表：${data.impacted_tables.join(', ') || '待评估'}`,
      data.assignee
    );

    const created = queryOne<Record<string, unknown>>(
      `SELECT r.*, p.name AS project_name, p.code AS project_code
       FROM requirements r JOIN projects p ON p.id = r.project_id
       WHERE r.id = ?`,
      [res.lastInsertId]
    );
    return reply.status(201).send(
      created
        ? {
            ...parseRequirementRow(created),
            project_name: String(created.project_name),
            project_code: String(created.project_code),
          }
        : null
    );
  });

  app.patch('/api/requirements/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const reqId = Number(id);
    const existing = queryOne<Record<string, unknown>>('SELECT * FROM requirements WHERE id = ?', [reqId]);
    if (!existing) {
      return reply.status(404).send({ error: '需求记录不存在' });
    }

    const parsed = updateRequirementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: '参数校验失败', issues: parsed.error.issues });
    }
    const prev = parseRequirementRow(existing);
    const patch = parsed.data;

    const nextTitle = patch.title ?? prev.title;
    const nextPriority = patch.priority ?? prev.priority;
    const nextStatus = patch.status ?? prev.status;
    const nextTables = patch.impacted_tables ?? prev.impacted_tables;
    const nextAssignee = patch.assignee ?? prev.assignee;
    const nextVersion = patch.target_version ?? prev.target_version;
    const nextDesc = patch.description ?? prev.description;
    const now = nowString();

    executeRun(
      `UPDATE requirements
       SET title = ?, priority = ?, status = ?, impacted_tables = ?, assignee = ?, target_version = ?, description = ?, updated_at = ?
       WHERE id = ?`,
      [nextTitle, nextPriority, nextStatus, JSON.stringify(nextTables), nextAssignee, nextVersion, nextDesc, now, reqId]
    );

    recordAuditLog(
      'REQUIREMENT',
      reqId,
      'UPDATE_REQUIREMENT',
      prev.code,
      `更新需求【${nextTitle}】：状态=${nextStatus}，优先级=${nextPriority}，目标版本=${nextVersion}`,
      nextAssignee
    );

    const updated = queryOne<Record<string, unknown>>(
      `SELECT r.*, p.name AS project_name, p.code AS project_code
       FROM requirements r JOIN projects p ON p.id = r.project_id
       WHERE r.id = ?`,
      [reqId]
    );
    return updated
      ? {
          ...parseRequirementRow(updated),
          project_name: String(updated.project_name),
          project_code: String(updated.project_code),
        }
      : null;
  });

  app.get('/api/audit-logs', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
    const items = queryAll<AuditLog>('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', [limit]);
    return { items };
  });
}
