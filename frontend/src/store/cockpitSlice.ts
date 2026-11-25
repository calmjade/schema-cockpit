import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api } from '../api/client';
import type { DashboardData, Project, RequirementItem, SchemaTable } from '../types';

export type CockpitTab = 'overview' | 'workbench' | 'er' | 'requirements';

interface CockpitState {
  activeTab: CockpitTab;
  selectedProjectId: number | 'all';
  selectedTableId: number | null;
  projects: Project[];
  projectsLoading: boolean;
  tables: SchemaTable[];
  tablesLoading: boolean;
  dashboard: DashboardData | null;
  dashboardLoading: boolean;
  requirements: RequirementItem[];
  requirementsLoading: boolean;
}

const initialState: CockpitState = {
  activeTab: 'overview',
  selectedProjectId: 'all',
  selectedTableId: null,
  projects: [],
  projectsLoading: false,
  tables: [],
  tablesLoading: false,
  dashboard: null,
  dashboardLoading: false,
  requirements: [],
  requirementsLoading: false,
};

export const fetchProjects = createAsyncThunk('cockpit/fetchProjects', async () => {
  const res = await api.getProjects();
  return res.items;
});

export const fetchDashboard = createAsyncThunk('cockpit/fetchDashboard', async () => {
  return await api.getDashboard();
});

export const fetchTables = createAsyncThunk(
  'cockpit/fetchTables',
  async (projectId: number | 'all' = 'all') => {
    const res = await api.getTables(projectId);
    return res.items;
  }
);

export const fetchRequirements = createAsyncThunk(
  'cockpit/fetchRequirements',
  async (params?: { projectId?: number | 'all'; status?: string }) => {
    const res = await api.getRequirements(params);
    return res.items;
  }
);

const cockpitSlice = createSlice({
  name: 'cockpit',
  initialState,
  reducers: {
    setActiveTab(state, action: PayloadAction<CockpitTab>) {
      state.activeTab = action.payload;
    },
    setSelectedProjectId(state, action: PayloadAction<number | 'all'>) {
      state.selectedProjectId = action.payload;
    },
    setSelectedTableId(state, action: PayloadAction<number | null>) {
      state.selectedTableId = action.payload;
    },
    jumpToTable(
      state,
      action: PayloadAction<{ projectId?: number | 'all'; tableId: number }>
    ) {
      if (action.payload.projectId !== undefined) {
        state.selectedProjectId = action.payload.projectId;
      }
      state.selectedTableId = action.payload.tableId;
      state.activeTab = 'workbench';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.projectsLoading = true;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.projectsLoading = false;
        state.projects = action.payload;
      })
      .addCase(fetchProjects.rejected, (state) => {
        state.projectsLoading = false;
      })
      .addCase(fetchDashboard.pending, (state) => {
        state.dashboardLoading = true;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.dashboardLoading = false;
        state.dashboard = action.payload;
      })
      .addCase(fetchDashboard.rejected, (state) => {
        state.dashboardLoading = false;
      })
      .addCase(fetchTables.pending, (state) => {
        state.tablesLoading = true;
      })
      .addCase(fetchTables.fulfilled, (state, action) => {
        state.tablesLoading = false;
        state.tables = action.payload;
        if (
          action.payload.length > 0 &&
          (state.selectedTableId === null ||
            !action.payload.some((t) => t.id === state.selectedTableId))
        ) {
          state.selectedTableId = action.payload[0].id;
        }
      })
      .addCase(fetchTables.rejected, (state) => {
        state.tablesLoading = false;
      })
      .addCase(fetchRequirements.pending, (state) => {
        state.requirementsLoading = true;
      })
      .addCase(fetchRequirements.fulfilled, (state, action) => {
        state.requirementsLoading = false;
        state.requirements = action.payload;
      })
      .addCase(fetchRequirements.rejected, (state) => {
        state.requirementsLoading = false;
      });
  },
});

export const { setActiveTab, setSelectedProjectId, setSelectedTableId, jumpToTable } =
  cockpitSlice.actions;

export default cockpitSlice.reducer;
