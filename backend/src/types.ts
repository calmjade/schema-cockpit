export interface Project {
  id: number;
  name: string;
  code: string;
  tech_stack: string;
  owner: string;
  env_status: string;
  description: string;
  created_at: string;
}

export interface SchemaTable {
  id: number;
  project_id: number;
  table_name: string;
  comment: string;
  engine: string;
  module: string;
  created_at: string;
  updated_at: string;
}

export interface SchemaColumn {
  id: number;
  table_id: number;
  name: string;
  data_type: string;
  length: string;
  is_pk: number;
  is_nullable: number;
  default_val: string;
  index_type: string;
  comment: string;
  ref_table: string;
  sort_order: number;
}

export type RequirementStatus = '待评审' | '开发中' | '联调中' | '已上线';

export interface Requirement {
  id: number;
  project_id: number;
  code: string;
  title: string;
  priority: string;
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

export interface CodegenArtifacts {
  mysqlDdl: string;
  typescriptZod: string;
  javaJpa: string;
  mybatisXml: string;
}
