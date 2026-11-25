import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'schema-cockpit.sqlite');

let dbInstance: Database | null = null;

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

export function persistDb(): void {
  if (!dbInstance) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const data = dbInstance.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export function queryAll<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function queryOne<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function executeRun(sql: string, params: SqlValue[] = []): { lastInsertId: number; changes: number } {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  const idRow = queryOne<{ id: number }>('SELECT last_insert_rowid() AS id');
  const changesRow = queryOne<{ c: number }>('SELECT changes() AS c');
  persistDb();
  return {
    lastInsertId: Number(idRow?.id ?? 0),
    changes: Number(changesRow?.c ?? 0),
  };
}

export function recordAuditLog(
  entityType: string,
  entityId: number,
  action: string,
  targetName: string,
  detail: string,
  operator = '曹杰'
): void {
  const db = getDb();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const stmt = db.prepare(
    `INSERT INTO audit_logs (entity_type, entity_id, action, target_name, detail, operator, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.bind([entityType, entityId, action, targetName, detail, operator, now]);
  stmt.step();
  stmt.free();
  persistDb();
}

function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      tech_stack TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '曹杰',
      env_status TEXT NOT NULL DEFAULT '生产运行',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      table_name TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      engine TEXT NOT NULL DEFAULT 'InnoDB',
      module TEXT NOT NULL DEFAULT '核心域',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schema_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      data_type TEXT NOT NULL,
      length TEXT NOT NULL DEFAULT '',
      is_pk INTEGER NOT NULL DEFAULT 0,
      is_nullable INTEGER NOT NULL DEFAULT 1,
      default_val TEXT NOT NULL DEFAULT '',
      index_type TEXT NOT NULL DEFAULT 'NONE',
      comment TEXT NOT NULL DEFAULT '',
      ref_table TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (table_id) REFERENCES schema_tables(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'P1',
      status TEXT NOT NULL DEFAULT '待评审',
      impacted_tables TEXT NOT NULL DEFAULT '[]',
      assignee TEXT NOT NULL DEFAULT '曹杰',
      target_version TEXT NOT NULL DEFAULT 'v1.0.0',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL DEFAULT 0,
      action TEXT NOT NULL,
      target_name TEXT NOT NULL,
      detail TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '曹杰',
      created_at TEXT NOT NULL
    );
  `);
}

interface SeedColumnInput {
  name: string;
  data_type: string;
  length: string;
  is_pk: number;
  is_nullable: number;
  default_val: string;
  index_type: string;
  comment: string;
  ref_table?: string;
}

function seedDatabase(db: Database): void {
  const countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM projects');
  countStmt.step();
  const countObj = countStmt.getAsObject() as { cnt: number };
  countStmt.free();
  if (Number(countObj.cnt) > 0) {
    return;
  }

  const now = '2026-11-20 10:30:00';

  const projects = [
    {
      name: '易贸通供应链核心库',
      code: 'SCM-CORE',
      tech_stack: 'Java 21 / Spring Boot 3 / MySQL 8 / Redis',
      owner: '曹杰',
      env_status: '生产运行',
      description: '支撑 B2B 跨境采购订单、供应商比价寻源、干线物流履约及统一账户体系的核心事务库',
    },
    {
      name: '智保数据中心库',
      code: 'INS-DATAHUB',
      tech_stack: 'TypeScript / Fastify / MySQL 8 / ClickHouse',
      owner: '曹杰',
      env_status: '联调测试',
      description: '面向保险核心承保台账、理赔风控流水与银保监合规报送数据集市的统一数据底座',
    },
    {
      name: '智慧园区物业库',
      code: 'PROP-IOT',
      tech_stack: 'Go / MySQL 8 / MQTT / Timescale',
      owner: '曹杰',
      env_status: '生产运行',
      description: '覆盖产业园区报修工单流转、楼宇智能物联传感器告警及设备全生命周期台账',
    },
  ];

  const projectIds: Record<string, number> = {};
  for (const p of projects) {
    const stmt = db.prepare(
      `INSERT INTO projects (name, code, tech_stack, owner, env_status, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.bind([p.name, p.code, p.tech_stack, p.owner, p.env_status, p.description, now]);
    stmt.step();
    stmt.free();
    const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
    idStmt.step();
    projectIds[p.code] = Number((idStmt.getAsObject() as { id: number }).id);
    idStmt.free();
  }

  const tablesSpec: Array<{
    projectCode: string;
    table_name: string;
    comment: string;
    engine: string;
    module: string;
    columns: SeedColumnInput[];
  }> = [
    {
      projectCode: 'SCM-CORE',
      table_name: 'usr_account',
      comment: '平台统一账户表',
      engine: 'InnoDB',
      module: '基础认证',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '主键ID' },
        { name: 'account_no', data_type: 'VARCHAR', length: '32', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'UNIQUE', comment: '统一账号编码' },
        { name: 'username', data_type: 'VARCHAR', length: '64', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '登录用户名' },
        { name: 'real_name', data_type: 'VARCHAR', length: '64', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '真实姓名' },
        { name: 'mobile', data_type: 'VARCHAR', length: '20', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'INDEX', comment: '脱敏手机号' },
        { name: 'org_name', data_type: 'VARCHAR', length: '128', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '所属企业或部门' },
        { name: 'role_code', data_type: 'VARCHAR', length: '32', is_pk: 0, is_nullable: 0, default_val: 'BUYER', index_type: 'NONE', comment: '角色标识' },
        { name: 'status', data_type: 'TINYINT', length: '4', is_pk: 0, is_nullable: 0, default_val: '1', index_type: 'NONE', comment: '状态 1-启用 0-停用' },
        { name: 'created_at', data_type: 'DATETIME', length: '', is_pk: 0, is_nullable: 0, default_val: 'CURRENT_TIMESTAMP', index_type: 'NONE', comment: '创建时间' },
      ],
    },
    {
      projectCode: 'SCM-CORE',
      table_name: 'scm_purchase_order',
      comment: '供应链采购主订单表',
      engine: 'InnoDB',
      module: '采购中心',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '采购单主键ID' },
        { name: 'order_no', data_type: 'VARCHAR', length: '40', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'UNIQUE', comment: '采购订单流水号' },
        { name: 'buyer_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '采购员账户ID', ref_table: 'usr_account' },
        { name: 'supplier_name', data_type: 'VARCHAR', length: '128', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '中标供应商名称' },
        { name: 'total_amount', data_type: 'DECIMAL', length: '14,2', is_pk: 0, is_nullable: 0, default_val: '0.00', index_type: 'NONE', comment: '采购含税总金额(元)' },
        { name: 'currency', data_type: 'VARCHAR', length: '8', is_pk: 0, is_nullable: 0, default_val: 'CNY', index_type: 'NONE', comment: '结算币种' },
        { name: 'order_status', data_type: 'VARCHAR', length: '24', is_pk: 0, is_nullable: 0, default_val: 'PENDING', index_type: 'INDEX', comment: '订单状态 PENDING/APPROVED/SHIPPED' },
        { name: 'expected_delivery_date', data_type: 'DATE', length: '', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'NONE', comment: '期望交货日期' },
        { name: 'created_at', data_type: 'DATETIME', length: '', is_pk: 0, is_nullable: 0, default_val: 'CURRENT_TIMESTAMP', index_type: 'NONE', comment: '下单时间' },
      ],
    },
    {
      projectCode: 'SCM-CORE',
      table_name: 'scm_supplier_quote',
      comment: '供应商比价报价单表',
      engine: 'InnoDB',
      module: '招采寻源',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '报价单主键ID' },
        { name: 'quote_no', data_type: 'VARCHAR', length: '40', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'UNIQUE', comment: '报价单号' },
        { name: 'order_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '关联采购单ID', ref_table: 'scm_purchase_order' },
        { name: 'supplier_code', data_type: 'VARCHAR', length: '32', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '供应商编码' },
        { name: 'unit_price', data_type: 'DECIMAL', length: '12,2', is_pk: 0, is_nullable: 0, default_val: '0.00', index_type: 'NONE', comment: '含税单价' },
        { name: 'lead_time_days', data_type: 'INT', length: '11', is_pk: 0, is_nullable: 0, default_val: '7', index_type: 'NONE', comment: '承诺交货周期(天)' },
        { name: 'is_selected', data_type: 'TINYINT', length: '1', is_pk: 0, is_nullable: 0, default_val: '0', index_type: 'NONE', comment: '是否中标 1-是 0-否' },
        { name: 'valid_until', data_type: 'DATETIME', length: '', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'NONE', comment: '报价有效期至' },
      ],
    },
    {
      projectCode: 'SCM-CORE',
      table_name: 'scm_logistics_waybill',
      comment: '干线物流履约运单表',
      engine: 'InnoDB',
      module: '履约物流',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '运单主键ID' },
        { name: 'waybill_no', data_type: 'VARCHAR', length: '48', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'UNIQUE', comment: '物流运单号' },
        { name: 'order_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '关联采购单ID', ref_table: 'scm_purchase_order' },
        { name: 'carrier_name', data_type: 'VARCHAR', length: '64', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '承运商名称' },
        { name: 'origin_city', data_type: 'VARCHAR', length: '64', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '始发城市' },
        { name: 'dest_city', data_type: 'VARCHAR', length: '64', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '目的城市' },
        { name: 'transit_status', data_type: 'VARCHAR', length: '24', is_pk: 0, is_nullable: 0, default_val: 'IN_TRANSIT', index_type: 'INDEX', comment: '运输节点状态' },
        { name: 'signed_at', data_type: 'DATETIME', length: '', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'NONE', comment: '签收时间' },
      ],
    },
    {
      projectCode: 'INS-DATAHUB',
      table_name: 'ins_policy_ledger',
      comment: '保单核心承保台账表',
      engine: 'InnoDB',
      module: '承保中心',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '保单台账主键' },
        { name: 'policy_no', data_type: 'VARCHAR', length: '48', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'UNIQUE', comment: '保单号' },
        { name: 'holder_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '投保人账户ID', ref_table: 'usr_account' },
        { name: 'product_code', data_type: 'VARCHAR', length: '32', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '险种产品代码' },
        { name: 'premium_amount', data_type: 'DECIMAL', length: '12,2', is_pk: 0, is_nullable: 0, default_val: '0.00', index_type: 'NONE', comment: '实缴保费(元)' },
        { name: 'coverage_amount', data_type: 'DECIMAL', length: '14,2', is_pk: 0, is_nullable: 0, default_val: '0.00', index_type: 'NONE', comment: '总保额(元)' },
        { name: 'effective_date', data_type: 'DATE', length: '', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '保单生效日期' },
        { name: 'policy_status', data_type: 'VARCHAR', length: '24', is_pk: 0, is_nullable: 0, default_val: 'ACTIVE', index_type: 'INDEX', comment: '保单状态 ACTIVE/EXPIRED/SURRENDER' },
      ],
    },
    {
      projectCode: 'INS-DATAHUB',
      table_name: 'ins_claim_record',
      comment: '理赔案件与风控流水表',
      engine: 'InnoDB',
      module: '理赔风控',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '理赔记录ID' },
        { name: 'claim_no', data_type: 'VARCHAR', length: '48', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'UNIQUE', comment: '理赔报案号' },
        { name: 'policy_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '关联保单ID', ref_table: 'ins_policy_ledger' },
        { name: 'incident_type', data_type: 'VARCHAR', length: '32', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '出险类型' },
        { name: 'claim_amount', data_type: 'DECIMAL', length: '12,2', is_pk: 0, is_nullable: 0, default_val: '0.00', index_type: 'NONE', comment: '申请理赔金额' },
        { name: 'approved_amount', data_type: 'DECIMAL', length: '12,2', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'NONE', comment: '核赔通过金额' },
        { name: 'risk_score', data_type: 'INT', length: '11', is_pk: 0, is_nullable: 0, default_val: '0', index_type: 'NONE', comment: '反欺诈风控评分(0-100)' },
        { name: 'claim_status', data_type: 'VARCHAR', length: '24', is_pk: 0, is_nullable: 0, default_val: 'AUDITING', index_type: 'INDEX', comment: '理赔状态 AUDITING/PAID/REJECTED' },
      ],
    },
    {
      projectCode: 'INS-DATAHUB',
      table_name: 'ins_report_dataset',
      comment: '监管报送数据集市表',
      engine: 'InnoDB',
      module: '数仓报表',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '数据集市记录ID' },
        { name: 'batch_month', data_type: 'VARCHAR', length: '7', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '统计账期 YYYY-MM' },
        { name: 'policy_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '来源保单ID', ref_table: 'ins_policy_ledger' },
        { name: 'claim_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'INDEX', comment: '来源理赔ID', ref_table: 'ins_claim_record' },
        { name: 'region_code', data_type: 'VARCHAR', length: '16', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '机构地区编码' },
        { name: 'loss_ratio', data_type: 'DECIMAL', length: '6,4', is_pk: 0, is_nullable: 0, default_val: '0.0000', index_type: 'NONE', comment: '当期赔付率' },
        { name: 'submitted_flag', data_type: 'TINYINT', length: '1', is_pk: 0, is_nullable: 0, default_val: '0', index_type: 'NONE', comment: '是否已报送监管' },
      ],
    },
    {
      projectCode: 'PROP-IOT',
      table_name: 'prop_device_sensor',
      comment: '园区智能物联设备台账表',
      engine: 'InnoDB',
      module: '智能物联',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '设备主键ID' },
        { name: 'device_sn', data_type: 'VARCHAR', length: '48', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'UNIQUE', comment: '设备唯一序列号' },
        { name: 'building_name', data_type: 'VARCHAR', length: '64', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '所在楼宇及楼层' },
        { name: 'sensor_type', data_type: 'VARCHAR', length: '32', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '传感类型 TEMP/SMOKE/POWER' },
        { name: 'last_reading', data_type: 'VARCHAR', length: '64', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'NONE', comment: '最近一次遥测读数' },
        { name: 'online_status', data_type: 'TINYINT', length: '1', is_pk: 0, is_nullable: 0, default_val: '1', index_type: 'INDEX', comment: '在线状态 1-在线 0-离线' },
        { name: 'last_heartbeat', data_type: 'DATETIME', length: '', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'NONE', comment: '最后心跳上报时间' },
      ],
    },
    {
      projectCode: 'PROP-IOT',
      table_name: 'prop_work_order',
      comment: '智慧园区运维报修工单表',
      engine: 'InnoDB',
      module: '物业服务',
      columns: [
        { name: 'id', data_type: 'BIGINT', length: '20', is_pk: 1, is_nullable: 0, default_val: 'AUTO_INCREMENT', index_type: 'PRIMARY', comment: '工单主键ID' },
        { name: 'ticket_no', data_type: 'VARCHAR', length: '36', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'UNIQUE', comment: '工单编号' },
        { name: 'device_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 1, default_val: '', index_type: 'INDEX', comment: '关联告警设备ID', ref_table: 'prop_device_sensor' },
        { name: 'reporter_id', data_type: 'BIGINT', length: '20', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'INDEX', comment: '报修人账户ID', ref_table: 'usr_account' },
        { name: 'issue_title', data_type: 'VARCHAR', length: '128', is_pk: 0, is_nullable: 0, default_val: '', index_type: 'NONE', comment: '故障简述' },
        { name: 'urgency_level', data_type: 'VARCHAR', length: '16', is_pk: 0, is_nullable: 0, default_val: 'NORMAL', index_type: 'NONE', comment: '紧急程度 LOW/NORMAL/URGENT' },
        { name: 'ticket_status', data_type: 'VARCHAR', length: '24', is_pk: 0, is_nullable: 0, default_val: 'OPEN', index_type: 'INDEX', comment: '处理状态 OPEN/PROCESSING/CLOSED' },
        { name: 'created_at', data_type: 'DATETIME', length: '', is_pk: 0, is_nullable: 0, default_val: 'CURRENT_TIMESTAMP', index_type: 'NONE', comment: '报修时间' },
      ],
    },
  ];

  const tableIds: Record<string, number> = {};
  for (const t of tablesSpec) {
    const pId = projectIds[t.projectCode];
    const stmt = db.prepare(
      `INSERT INTO schema_tables (project_id, table_name, comment, engine, module, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.bind([pId, t.table_name, t.comment, t.engine, t.module, now, now]);
    stmt.step();
    stmt.free();
    const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
    idStmt.step();
    const tableId = Number((idStmt.getAsObject() as { id: number }).id);
    idStmt.free();
    tableIds[t.table_name] = tableId;

    t.columns.forEach((col, idx) => {
      const cStmt = db.prepare(
        `INSERT INTO schema_columns
         (table_id, name, data_type, length, is_pk, is_nullable, default_val, index_type, comment, ref_table, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      cStmt.bind([
        tableId,
        col.name,
        col.data_type,
        col.length,
        col.is_pk,
        col.is_nullable,
        col.default_val,
        col.index_type,
        col.comment,
        col.ref_table ?? '',
        idx + 1,
      ]);
      cStmt.step();
      cStmt.free();
    });
  }

  const requirements = [
    {
      projectCode: 'SCM-CORE',
      code: 'REQ-2026-101',
      title: '跨境采购订单支持多币种汇率锁汇字段扩展',
      priority: 'P0',
      status: '开发中',
      impacted_tables: ['scm_purchase_order', 'scm_supplier_quote'],
      assignee: '曹杰',
      target_version: 'v2.4.0',
      description: '采购主表与报价单增加结算币种校验及锁汇窗口字段，支持美元/欧元直采业务。',
    },
    {
      projectCode: 'SCM-CORE',
      code: 'REQ-2026-102',
      title: '干线物流运单异常签收轨迹索引优化',
      priority: 'P1',
      status: '已上线',
      impacted_tables: ['scm_logistics_waybill', 'usr_account'],
      assignee: '曹杰',
      target_version: 'v2.3.5',
      description: '针对运单号及承运商状态补充组合索引，解决高峰期物流看板慢查询问题。',
    },
    {
      projectCode: 'INS-DATAHUB',
      code: 'REQ-2026-201',
      title: '理赔反欺诈评分与监管月报赔付率联动计算',
      priority: 'P0',
      status: '联调中',
      impacted_tables: ['ins_claim_record', 'ins_report_dataset', 'ins_policy_ledger'],
      assignee: '曹杰',
      target_version: 'v1.8.0',
      description: '理赔案件落库时同步写入 risk_score，ETL 每日凌晨聚合生成监管报送宽表。',
    },
    {
      projectCode: 'PROP-IOT',
      code: 'REQ-2026-301',
      title: '物联设备离线自动触发园区应急维修工单',
      priority: 'P1',
      status: '待评审',
      impacted_tables: ['prop_device_sensor', 'prop_work_order'],
      assignee: '曹杰',
      target_version: 'v3.1.0',
      description: '当传感器连续 3 个心跳周期未上报时，自动关联 device_id 创建 URGENT 级别维修工单。',
    },
  ];

  for (const r of requirements) {
    const stmt = db.prepare(
      `INSERT INTO requirements
       (project_id, code, title, priority, status, impacted_tables, assignee, target_version, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.bind([
      projectIds[r.projectCode],
      r.code,
      r.title,
      r.priority,
      r.status,
      JSON.stringify(r.impacted_tables),
      r.assignee,
      r.target_version,
      r.description,
      now,
      now,
    ]);
    stmt.step();
    stmt.free();
  }

  const audits = [
    {
      entity_type: 'TABLE',
      entity_id: tableIds['scm_purchase_order'],
      action: 'CREATE_TABLE',
      target_name: 'scm_purchase_order',
      detail: '初始化供应链采购主订单表结构（9 个字段，含 usr_account 外键引用）',
      created_at: '2026-11-20 10:35:00',
    },
    {
      entity_type: 'COLUMN',
      entity_id: tableIds['ins_claim_record'],
      action: 'UPDATE_COLUMNS',
      target_name: 'ins_claim_record',
      detail: '新增反欺诈风控评分字段 risk_score 与理赔状态索引',
      created_at: '2026-11-21 14:20:00',
    },
    {
      entity_type: 'REQUIREMENT',
      entity_id: 3,
      action: 'UPDATE_STATUS',
      target_name: 'REQ-2026-201',
      detail: '需求状态流转至【联调中】，关联表：ins_claim_record, ins_report_dataset',
      created_at: '2026-11-22 09:15:00',
    },
    {
      entity_type: 'TABLE',
      entity_id: tableIds['prop_work_order'],
      action: 'CREATE_TABLE',
      target_name: 'prop_work_order',
      detail: '建立智慧园区运维报修工单表并绑定 prop_device_sensor 拓扑关联',
      created_at: '2026-11-23 16:40:00',
    },
  ];

  for (const a of audits) {
    const stmt = db.prepare(
      `INSERT INTO audit_logs (entity_type, entity_id, action, target_name, detail, operator, created_at)
       VALUES (?, ?, ?, ?, ?, '曹杰', ?)`
    );
    stmt.bind([a.entity_type, a.entity_id, a.action, a.target_name, a.detail, a.created_at]);
    stmt.step();
    stmt.free();
  }
}

export async function initDatabase(): Promise<void> {
  if (dbInstance) return;
  const SQL = await initSqlJs();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(buffer);
  } else {
    dbInstance = new SQL.Database();
  }
  dbInstance.run('PRAGMA foreign_keys = ON;');
  createSchema(dbInstance);
  seedDatabase(dbInstance);
  persistDb();
}
