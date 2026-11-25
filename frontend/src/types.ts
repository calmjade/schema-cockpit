export interface Project {
  id: number;
  name: string;
  code: string;
  tech_stack: string;
  owner: string;
  env_status: string;
  description: string;
  created_at: string;
  table_count?: number;
}

export interface SchemaColumn {
  id?: number;
  table_id?: number;
  name: string;
  data_type: string;
  length: string;
  is_pk: number;
  is_nullable: number;
  default_val: string;
  index_type: 'NONE' | 'PRIMARY' | 'UNIQUE' | 'INDEX';
  comment: string;
  ref_table: string;
  sort_order?: number;
}

export interface SchemaTable {
  id: number;
  project_id: number;
  project_name?: string;
  project_code?: string;
  table_name: string;
  comment: string;
  engine: string;
  module: string;
  created_at: string;
  updated_at: string;
  columns: SchemaColumn[];
}

export type RequirementStatus = '待评审' | '开发中' | '联调中' | '已上线';

export interface RequirementItem {
  id: number;
  project_id: number;
  project_name?: string;
  project_code?: string;
  code: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: RequirementStatus;
  impacted_tables: string[];
  assignee: string;
  target_version: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  target_name: string;
  detail: string;
  operator: string;
  created_at: string;
}

export interface DashboardData {
  projectCount: number;
  tableCount: number;
  columnCount: number;
  requirementCount: number;
  relationCount: number;
  requirementStatusDist: Record<string, number>;
  projectBreakdown: Array<{
    id: number;
    name: string;
    code: string;
    env_status: string;
    table_count: number;
    column_count: number;
  }>;
  recentAuditLogs: AuditLog[];
}

export interface SearchResult {
  tables: Array<SchemaTable & { column_count: number }>;
  columns: Array<
    SchemaColumn & {
      table_name: string;
      table_comment: string;
      project_id: number;
      project_name: string;
      project_code: string;
    }
  >;
}

export interface CodegenResponse {
  table: SchemaTable;
  columns: SchemaColumn[];
  artifacts: {
    mysqlDdl: string;
    typescriptZod: string;
    javaJpa: string;
    mybatisXml: string;
  };
}

export interface ErNode {
  id: number;
  table_name: string;
  comment: string;
  module: string;
  project_id: number;
  project_name: string;
  project_code: string;
  x: number;
  y: number;
  columns: SchemaColumn[];
}

export interface ErEdge {
  id: string;
  source_table_id: number;
  source_table: string;
  source_column: string;
  target_table_id: number;
  target_table: string;
  label: string;
}

export interface ErGraphResponse {
  nodes: ErNode[];
  edges: ErEdge[];
}
