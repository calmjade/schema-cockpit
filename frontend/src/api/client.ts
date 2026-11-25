import type {
  CodegenResponse,
  DashboardData,
  ErGraphResponse,
  Project,
  RequirementItem,
  RequirementStatus,
  SchemaColumn,
  SchemaTable,
  SearchResult,
} from '../types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export const api = {
  getDashboard: () => request<DashboardData>('/api/dashboard'),
  getProjects: () => request<{ items: Project[] }>('/api/projects'),
  createProject: (payload: Omit<Project, 'id' | 'created_at' | 'table_count'>) =>
    request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTables: (projectId?: number | 'all') =>
    request<{ items: SchemaTable[] }>(
      projectId && projectId !== 'all' ? `/api/tables?projectId=${projectId}` : '/api/tables'
    ),
  createTable: (payload: {
    project_id: number;
    table_name: string;
    comment: string;
    engine: string;
    module: string;
  }) =>
    request<SchemaTable>('/api/tables', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateTable: (
    id: number,
    payload: Partial<{
      table_name: string;
      comment: string;
      engine: string;
      module: string;
      project_id: number;
    }>
  ) =>
    request<SchemaTable>(`/api/tables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteTable: (id: number) =>
    request<{ deleted: boolean; id: number }>(`/api/tables/${id}`, {
      method: 'DELETE',
    }),
  saveTableColumns: (tableId: number, columns: SchemaColumn[]) =>
    request<{ table_id: number; columns: SchemaColumn[] }>(`/api/tables/${tableId}/columns`, {
      method: 'POST',
      body: JSON.stringify({ columns }),
    }),
  searchGlobal: (q: string) =>
    request<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`),
  getCodegen: (tableId: number) =>
    request<CodegenResponse>(`/api/tables/${tableId}/codegen`),
  getErGraph: (projectId?: number | 'all') =>
    request<ErGraphResponse>(
      projectId && projectId !== 'all' ? `/api/er-graph?projectId=${projectId}` : '/api/er-graph'
    ),
  getRequirements: (params?: { projectId?: number | 'all'; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.projectId && params.projectId !== 'all') qs.set('projectId', String(params.projectId));
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ items: RequirementItem[] }>(`/api/requirements${suffix}`);
  },
  createRequirement: (payload: {
    project_id: number;
    title: string;
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    status: RequirementStatus;
    impacted_tables: string[];
    assignee: string;
    target_version: string;
    description: string;
  }) =>
    request<RequirementItem>('/api/requirements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRequirement: (
    id: number,
    payload: Partial<{
      title: string;
      priority: 'P0' | 'P1' | 'P2' | 'P3';
      status: RequirementStatus;
      impacted_tables: string[];
      assignee: string;
      target_version: string;
      description: string;
    }>
  ) =>
    request<RequirementItem>(`/api/requirements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
