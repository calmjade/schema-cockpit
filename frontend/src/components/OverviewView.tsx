import React, { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  AuditOutlined,
  DatabaseOutlined,
  FieldNumberOutlined,
  FolderAddOutlined,
  ProjectOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { api } from '../api/client';
import type { SearchResult } from '../types';
import {
  fetchDashboard,
  fetchProjects,
  fetchTables,
  jumpToTable,
  setActiveTab,
  setSelectedProjectId,
} from '../store/cockpitSlice';
import { useAppDispatch, useAppSelector } from '../store';

const { Text, Paragraph } = Typography;

const ENV_STATUS_COLOR: Record<string, string> = {
  生产运行: 'green',
  联调测试: 'blue',
  灰度验证: 'orange',
  归档只读: 'default',
};

const AUDIT_ACTION_TAG: Record<string, { label: string; color: string }> = {
  CREATE_PROJECT: { label: '新建项目', color: 'purple' },
  CREATE_TABLE: { label: '新建数据表', color: 'green' },
  UPDATE_TABLE: { label: '更新表元信息', color: 'blue' },
  DELETE_TABLE: { label: '删除数据表', color: 'red' },
  SAVE_COLUMNS: { label: '保存字段结构', color: 'cyan' },
  UPDATE_COLUMNS: { label: '变更字段结构', color: 'cyan' },
  CREATE_REQUIREMENT: { label: '新增研发需求', color: 'geekblue' },
  UPDATE_REQUIREMENT: { label: '更新需求排期', color: 'gold' },
  UPDATE_STATUS: { label: '状态流转', color: 'gold' },
};

const QUICK_KEYWORDS = ['order', 'account', 'policy', 'device', 'status', 'amount'];

export const OverviewView: React.FC = () => {
  const dispatch = useAppDispatch();
  const { dashboard, dashboardLoading, projects, tables } = useAppSelector((s) => s.cockpit);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectForm] = Form.useForm();

  const runSearch = async (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) {
      setSearchResult(null);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await api.searchGlobal(trimmed);
      setSearchResult(res);
      setHasSearched(true);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '全局检索失败');
    } finally {
      setSearching(false);
    }
  };

  const handleCreateProject = async () => {
    try {
      const values = await projectForm.validateFields();
      setCreatingProject(true);
      await api.createProject(values);
      message.success(`项目【${values.name}】创建成功`);
      setProjectModalOpen(false);
      projectForm.resetFields();
      dispatch(fetchProjects());
      dispatch(fetchDashboard());
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '创建项目失败');
    } finally {
      setCreatingProject(false);
    }
  };

  const totalReqs = dashboard?.requirementCount ?? 0;
  const dist = dashboard?.requirementStatusDist ?? {};

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Top KPI Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6} xl={4}>
          <Card className="cockpit-card" loading={dashboardLoading}>
            <Statistic
              title="纳管项目资产"
              value={dashboard?.projectCount ?? 0}
              prefix={<ProjectOutlined style={{ color: '#2563eb' }} />}
              suffix="个"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6} xl={5}>
          <Card className="cockpit-card" loading={dashboardLoading}>
            <Statistic
              title="数据表结构总数"
              value={dashboard?.tableCount ?? 0}
              prefix={<TableOutlined style={{ color: '#0891b2' }} />}
              suffix="张"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6} xl={5}>
          <Card className="cockpit-card" loading={dashboardLoading}>
            <Statistic
              title="字段元数据规模"
              value={dashboard?.columnCount ?? 0}
              prefix={<FieldNumberOutlined style={{ color: '#7c3aed' }} />}
              suffix="个"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6} xl={5}>
          <Card className="cockpit-card" loading={dashboardLoading}>
            <Statistic
              title="ER 外键拓扑关联"
              value={dashboard?.relationCount ?? 0}
              prefix={<ApartmentOutlined style={{ color: '#059669' }} />}
              suffix="条"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6} xl={5}>
          <Card className="cockpit-card" loading={dashboardLoading}>
            <Statistic
              title="关联变更需求"
              value={dashboard?.requirementCount ?? 0}
              prefix={<AuditOutlined style={{ color: '#d97706' }} />}
              suffix="项"
            />
          </Card>
        </Col>
      </Row>

      {/* Global Search Card */}
      <Card
        className="cockpit-card"
        title={
          <Space>
            <SearchOutlined style={{ color: '#2563eb' }} />
            <span>跨项目全局表结构与字段资产检索</span>
          </Space>
        }
        extra={
          <Space size={6} wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>
              快捷检索：
            </Text>
            {QUICK_KEYWORDS.map((kw) => (
              <Tag
                key={kw}
                color="blue"
                style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                onClick={() => {
                  setSearchKeyword(kw);
                  void runSearch(kw);
                }}
              >
                {kw}
              </Tag>
            ))}
          </Space>
        }
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="输入任意表名、字段名、模块名、中文注释或外键引用表名（如 order_no、risk_score、usr_account）..."
            value={searchKeyword}
            onChange={(e) => {
              const val = e.target.value;
              setSearchKeyword(val);
              if (!val.trim()) {
                setSearchResult(null);
                setHasSearched(false);
              }
            }}
            onPressEnter={() => void runSearch(searchKeyword)}
          />
          <Button
            type="primary"
            size="large"
            loading={searching}
            icon={<SearchOutlined />}
            onClick={() => void runSearch(searchKeyword)}
          >
            全局检索
          </Button>
        </Space.Compact>

        {hasSearched && searchResult && (
          <div style={{ marginTop: 16 }}>
            <Tabs
              defaultActiveKey="columns"
              items={[
                {
                  key: 'columns',
                  label: (
                    <span>
                      匹配字段 <Badge count={searchResult.columns.length} showZero color="#2563eb" />
                    </span>
                  ),
                  children: (
                    <Table
                      size="small"
                      rowKey={(r) => `${r.table_id}-${r.name}-${r.id ?? ''}`}
                      dataSource={searchResult.columns}
                      pagination={{ pageSize: 8, hideOnSinglePage: true }}
                      locale={{ emptyText: <Empty description="未匹配到符合条件的字段" /> }}
                      columns={[
                        {
                          title: '字段名',
                          dataIndex: 'name',
                          width: 170,
                          render: (val: string, record) => (
                            <Space size={6}>
                              <Text strong className="mono">
                                {val}
                              </Text>
                              {record.is_pk === 1 && <Tag color="gold">PK</Tag>}
                            </Space>
                          ),
                        },
                        {
                          title: '类型',
                          width: 130,
                          render: (_, r) => (
                            <Tag className="mono">
                              {r.data_type}
                              {r.length ? `(${r.length})` : ''}
                            </Tag>
                          ),
                        },
                        {
                          title: '字段注释',
                          dataIndex: 'comment',
                          render: (v: string) => v || <Text type="secondary">-</Text>,
                        },
                        {
                          title: '所属数据表',
                          width: 220,
                          render: (_, r) => (
                            <Button
                              type="link"
                              size="small"
                              style={{ padding: 0 }}
                              onClick={() =>
                                dispatch(
                                  jumpToTable({
                                    projectId: r.project_id,
                                    tableId: r.table_id ?? 0,
                                  })
                                )
                              }
                            >
                              <span className="mono">{r.table_name}</span>
                              <SendOutlined style={{ marginLeft: 4, fontSize: 11 }} />
                            </Button>
                          ),
                        },
                        {
                          title: '所属项目',
                          width: 170,
                          render: (_, r) => (
                            <Tag color="geekblue">
                              {r.project_code} · {r.project_name}
                            </Tag>
                          ),
                        },
                        {
                          title: '外键关联',
                          dataIndex: 'ref_table',
                          width: 160,
                          render: (v: string) =>
                            v ? <Tag color="green" className="mono">→ {v}</Tag> : '-',
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'tables',
                  label: (
                    <span>
                      匹配数据表 <Badge count={searchResult.tables.length} showZero color="#0891b2" />
                    </span>
                  ),
                  children: (
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={searchResult.tables}
                      pagination={{ pageSize: 8, hideOnSinglePage: true }}
                      locale={{ emptyText: <Empty description="未匹配到符合条件的数据表" /> }}
                      columns={[
                        {
                          title: '表名',
                          dataIndex: 'table_name',
                          render: (v: string, r) => (
                            <Button
                              type="link"
                              size="small"
                              style={{ padding: 0 }}
                              onClick={() =>
                                dispatch(jumpToTable({ projectId: r.project_id, tableId: r.id }))
                              }
                            >
                              <Text strong className="mono" style={{ color: '#2563eb' }}>
                                {v}
                              </Text>
                            </Button>
                          ),
                        },
                        { title: '中文描述', dataIndex: 'comment' },
                        {
                          title: '业务域',
                          dataIndex: 'module',
                          render: (v: string) => <Tag>{v}</Tag>,
                        },
                        {
                          title: '字段数',
                          dataIndex: 'column_count',
                          width: 90,
                          render: (v: number) => <Tag color="blue">{v} 列</Tag>,
                        },
                        {
                          title: '所属项目',
                          render: (_, r) => (
                            <Tag color="geekblue">
                              {r.project_code} · {r.project_name}
                            </Tag>
                          ),
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        {/* Project Asset Matrix */}
        <Col xs={24} lg={14}>
          <Card
            className="cockpit-card"
            title={
              <Space>
                <DatabaseOutlined style={{ color: '#2563eb' }} />
                <span>多项目数据库资产矩阵</span>
              </Space>
            }
            extra={
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  size="small"
                  onClick={() => {
                    dispatch(fetchDashboard());
                    dispatch(fetchProjects());
                    dispatch(fetchTables('all'));
                  }}
                >
                  刷新
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<FolderAddOutlined />}
                  onClick={() => setProjectModalOpen(true)}
                >
                  新建项目
                </Button>
              </Space>
            }
          >
            <List
              dataSource={projects}
              loading={dashboardLoading}
              locale={{ emptyText: <Empty description="暂无项目" /> }}
              renderItem={(proj) => {
                const breakdown = dashboard?.projectBreakdown.find((b) => b.id === proj.id);
                const tCount = breakdown?.table_count ?? proj.table_count ?? 0;
                const cCount = breakdown?.column_count ?? 0;
                const projTables = tables.filter((t) => t.project_id === proj.id);
                return (
                  <List.Item
                    actions={[
                      <Button
                        key="open"
                        type="link"
                        onClick={() => {
                          dispatch(setSelectedProjectId(proj.id));
                          if (projTables.length > 0) {
                            dispatch(
                              jumpToTable({ projectId: proj.id, tableId: projTables[0].id })
                            );
                          } else {
                            dispatch(setActiveTab('workbench'));
                          }
                        }}
                      >
                        进入工作台 →
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space wrap>
                          <Text strong style={{ fontSize: 15 }}>
                            {proj.name}
                          </Text>
                          <Tag className="mono" color="geekblue">
                            {proj.code}
                          </Tag>
                          <Tag color={ENV_STATUS_COLOR[proj.env_status] ?? 'default'}>
                            {proj.env_status}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Paragraph
                            type="secondary"
                            style={{ marginBottom: 0, fontSize: 13 }}
                            ellipsis={{ rows: 2 }}
                          >
                            {proj.description || '暂无项目说明'}
                          </Paragraph>
                          <Space size={12} wrap style={{ fontSize: 12 }}>
                            <Text type="secondary">技术栈：{proj.tech_stack}</Text>
                            <Text type="secondary">负责人：{proj.owner}</Text>
                            <Tag color="cyan">{tCount} 张表</Tag>
                            <Tag color="purple">{cCount} 个字段</Tag>
                          </Space>
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />

            <div
              style={{
                marginTop: 16,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <Text strong>需求变更状态分布</Text>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => dispatch(setActiveTab('requirements'))}
                >
                  查看排期看板 →
                </Button>
              </div>
              <Row gutter={[12, 8]}>
                {(['待评审', '开发中', '联调中', '已上线'] as const).map((status) => {
                  const val = dist[status] ?? 0;
                  const pct = totalReqs > 0 ? Math.round((val / totalReqs) * 100) : 0;
                  const stroke =
                    status === '已上线'
                      ? '#10b981'
                      : status === '联调中'
                      ? '#2563eb'
                      : status === '开发中'
                      ? '#f59e0b'
                      : '#64748b';
                  return (
                    <Col xs={12} sm={6} key={status}>
                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                        {status} ({val})
                      </div>
                      <Progress percent={pct} size="small" strokeColor={stroke} showInfo={false} />
                    </Col>
                  );
                })}
              </Row>
            </div>
          </Card>
        </Col>

        {/* Recent Schema Audit Feed */}
        <Col xs={24} lg={10}>
          <Card
            className="cockpit-card"
            title={
              <Space>
                <AuditOutlined style={{ color: '#2563eb' }} />
                <span>近期结构审计与变更动态</span>
              </Space>
            }
          >
            {dashboard?.recentAuditLogs && dashboard.recentAuditLogs.length > 0 ? (
              <Timeline
                items={dashboard.recentAuditLogs.map((log) => {
                  const meta = AUDIT_ACTION_TAG[log.action] ?? {
                    label: log.action,
                    color: 'default',
                  };
                  return {
                    color: meta.color === 'red' ? 'red' : 'blue',
                    children: (
                      <div>
                        <Space size={6} wrap>
                          <Tag color={meta.color}>{meta.label}</Tag>
                          <Text strong className="mono">
                            {log.target_name}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            by {log.operator}
                          </Text>
                        </Space>
                        <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>
                          {log.detail}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          {log.created_at}
                        </div>
                      </div>
                    ),
                  };
                })}
              />
            ) : (
              <Empty description="暂无审计日志" />
            )}
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        message="提示：点击检索结果或项目列表中的数据表，可直达「表结构工作台」编辑字段或一键导出 MySQL DDL / TypeScript / JPA / MyBatis 代码。"
      />

      {/* Create Project Modal */}
      <Modal
        title="新建纳管数据库项目"
        open={projectModalOpen}
        onCancel={() => setProjectModalOpen(false)}
        onOk={() => void handleCreateProject()}
        confirmLoading={creatingProject}
        okText="确认创建"
        cancelText="取消"
      >
        <Form form={projectForm} layout="vertical" initialValues={{ owner: '曹杰', env_status: '联调测试' }}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：跨境结算风控中心库" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="code"
                label="项目编码"
                rules={[{ required: true, message: '请输入项目编码' }]}
              >
                <Input className="mono" placeholder="例如：FIN-RISK" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="env_status" label="运行状态">
                <Select
                  options={[
                    { value: '生产运行', label: '生产运行' },
                    { value: '联调测试', label: '联调测试' },
                    { value: '灰度验证', label: '灰度验证' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item
                name="tech_stack"
                label="技术栈"
                rules={[{ required: true, message: '请输入技术栈' }]}
              >
                <Input placeholder="例如：Java 21 / Spring Boot 3 / MySQL 8" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="owner" label="负责人">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea rows={3} placeholder="描述该数据库项目的业务域与职责边界" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
