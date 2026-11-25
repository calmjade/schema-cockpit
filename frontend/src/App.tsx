import React, { useEffect } from 'react';
import { Layout, Menu, Space, Tag, Typography } from 'antd';
import {
  ApartmentOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ScheduleOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { OverviewView } from './components/OverviewView';
import { WorkbenchView } from './components/WorkbenchView';
import { ErDiagramView } from './components/ErDiagramView';
import { RequirementsView } from './components/RequirementsView';
import {
  fetchDashboard,
  fetchProjects,
  fetchRequirements,
  fetchTables,
  setActiveTab,
  type CockpitTab,
} from './store/cockpitSlice';
import { useAppDispatch, useAppSelector } from './store';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const TAB_TITLES: Record<CockpitTab, { title: string; subtitle: string }> = {
  overview: {
    title: '研发总览与全局字段检索',
    subtitle: '跨项目表结构资产统计、任意字段秒级模糊定位与研发审计追踪',
  },
  workbench: {
    title: '表结构工作台与代码生成器',
    subtitle: '在线设计表字段与索引约束，一键生成 MySQL DDL / TypeScript / Java JPA / MyBatis 代码',
  },
  er: {
    title: 'ER 关系拓扑图',
    subtitle: '基于外键引用的交互式 SVG 实体关系拓扑画布',
  },
  requirements: {
    title: '需求与变更排期看板',
    subtitle: '研发变更需求与受影响数据表联动跟踪与状态流转',
  },
};

export const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const { activeTab, projects, tables } = useAppSelector((s) => s.cockpit);

  useEffect(() => {
    dispatch(fetchDashboard());
    dispatch(fetchProjects());
    dispatch(fetchTables('all'));
    dispatch(fetchRequirements());
  }, [dispatch]);

  const currentMeta = TAB_TITLES[activeTab];

  return (
    <Layout className="cockpit-shell">
      <Sider width={236} breakpoint="lg" collapsedWidth={72} className="cockpit-sider">
        <div className="cockpit-logo">
          <div className="cockpit-logo-badge">
            <DatabaseOutlined />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>
              星枢研发舱
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
              Schema Cockpit
            </div>
          </div>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeTab]}
          onClick={({ key }) => dispatch(setActiveTab(key as CockpitTab))}
          style={{ background: 'transparent', borderRight: 0, marginTop: 10 }}
          items={[
            {
              key: 'overview',
              icon: <DashboardOutlined />,
              label: '研发总览与检索',
            },
            {
              key: 'workbench',
              icon: <TableOutlined />,
              label: '表结构与代码生成',
            },
            {
              key: 'er',
              icon: <ApartmentOutlined />,
              label: 'ER 关系拓扑图',
            },
            {
              key: 'requirements',
              icon: <ScheduleOutlined />,
              label: '需求变更排期',
            },
          ]}
        />

        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
            color: '#94a3b8',
            fontSize: 11.5,
          }}
        >
          <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>
            资产库就绪
          </div>
          <div>
            {projects.length} 个项目 · {tables.length} 张表
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
            Author: calmjade
          </div>
        </div>
      </Sider>

      <Layout style={{ background: 'var(--cockpit-bg)' }}>
        <Header className="cockpit-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text strong style={{ fontSize: 16 }}>
              {currentMeta.title}
            </Text>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {currentMeta.subtitle}
            </Text>
          </div>
          <Space size={8}>
            <Tag color="green">SQL.js 本地持久化</Tag>
            <Tag color="blue" className="mono">
              API :8092
            </Tag>
          </Space>
        </Header>

        <Content style={{ padding: 20, maxWidth: 1600, width: '100%', margin: '0 auto' }}>
          {activeTab === 'overview' && <OverviewView />}
          {activeTab === 'workbench' && <WorkbenchView />}
          {activeTab === 'er' && <ErDiagramView />}
          {activeTab === 'requirements' && <RequirementsView />}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
