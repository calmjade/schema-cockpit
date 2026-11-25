import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  ScheduleOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { api } from '../api/client';
import type { RequirementItem, RequirementStatus } from '../types';
import {
  fetchDashboard,
  fetchRequirements,
  jumpToTable,
  setSelectedProjectId,
} from '../store/cockpitSlice';
import { useAppDispatch, useAppSelector } from '../store';

const { Text } = Typography;

const STATUS_OPTIONS: RequirementStatus[] = ['待评审', '开发中', '联调中', '已上线'];

const STATUS_COLOR: Record<RequirementStatus, string> = {
  待评审: 'default',
  开发中: 'processing',
  联调中: 'warning',
  已上线: 'success',
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'red',
  P1: 'orange',
  P2: 'blue',
  P3: 'default',
};

export const RequirementsView: React.FC = () => {
  const dispatch = useAppDispatch();
  const { projects, tables, requirements, requirementsLoading, selectedProjectId } = useAppSelector(
    (s) => s.cockpit
  );

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createForm] = Form.useForm();

  const [editingItem, setEditingItem] = useState<RequirementItem | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editForm] = Form.useForm();

  const filteredRequirements = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return requirements.filter((r) => {
      if (selectedProjectId !== 'all' && r.project_id !== selectedProjectId) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!kw) return true;
      return (
        r.title.toLowerCase().includes(kw) ||
        r.code.toLowerCase().includes(kw) ||
        r.description.toLowerCase().includes(kw) ||
        r.impacted_tables.some((t) => t.toLowerCase().includes(kw))
      );
    });
  }, [requirements, selectedProjectId, statusFilter, keyword]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, 待评审: 0, 开发中: 0, 联调中: 0, 已上线: 0 };
    for (const r of requirements) {
      if (selectedProjectId !== 'all' && r.project_id !== selectedProjectId) continue;
      counts.all += 1;
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [requirements, selectedProjectId]);

  const allTableOptions = useMemo(
    () =>
      tables.map((t) => ({
        value: t.table_name,
        label: `${t.table_name} (${t.comment || t.module})`,
      })),
    [tables]
  );

  const handleQuickStatusChange = async (record: RequirementItem, nextStatus: RequirementStatus) => {
    try {
      await api.updateRequirement(record.id, { status: nextStatus });
      message.success(`需求 ${record.code} 状态已更新为「${nextStatus}」`);
      dispatch(fetchRequirements());
      dispatch(fetchDashboard());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新状态失败');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setSubmittingCreate(true);
      await api.createRequirement(values);
      message.success('研发变更需求已创建');
      setCreateOpen(false);
      createForm.resetFields();
      dispatch(fetchRequirements());
      dispatch(fetchDashboard());
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '创建需求失败');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      const values = await editForm.validateFields();
      setSubmittingEdit(true);
      await api.updateRequirement(editingItem.id, values);
      message.success(`需求 ${editingItem.code} 已更新`);
      setEditingItem(null);
      dispatch(fetchRequirements());
      dispatch(fetchDashboard());
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '更新需求失败');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleJumpToImpactedTable = (tableName: string) => {
    const target = tables.find((t) => t.table_name === tableName);
    if (!target) {
      message.warning(`未在当前资产库中找到表 ${tableName}`);
      return;
    }
    dispatch(jumpToTable({ projectId: target.project_id, tableId: target.id }));
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        className="cockpit-card"
        title={
          <Space>
            <ScheduleOutlined style={{ color: '#2563eb' }} />
            <span>研发需求与表结构变更排期看板</span>
          </Space>
        }
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => dispatch(fetchRequirements())}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.setFieldsValue({
                  project_id: selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id,
                  priority: 'P1',
                  status: '待评审',
                  assignee: '曹杰',
                  target_version: 'v1.2.0',
                  impacted_tables: [],
                });
                setCreateOpen(true);
              }}
            >
              新建变更需求
            </Button>
          </Space>
        }
      >
        <Space
          wrap
          style={{
            width: '100%',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <Space wrap>
            <Select
              style={{ width: 210 }}
              value={selectedProjectId}
              onChange={(val) => dispatch(setSelectedProjectId(val))}
              options={[
                { value: 'all', label: '全部项目' },
                ...projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
              ]}
            />
            <Segmented
              value={statusFilter}
              onChange={(val) => setStatusFilter(String(val))}
              options={[
                { value: 'all', label: `全部 (${statusCounts.all})` },
                ...STATUS_OPTIONS.map((st) => ({
                  value: st,
                  label: `${st} (${statusCounts[st] ?? 0})`,
                })),
              ]}
            />
          </Space>
          <Input.Search
            allowClear
            style={{ width: 280 }}
            placeholder="搜索需求编号 / 标题 / 影响表名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Space>

        <Table<RequirementItem>
          rowKey="id"
          loading={requirementsLoading}
          dataSource={filteredRequirements}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 1050 }}
          locale={{ emptyText: <Empty description="暂无匹配的研发变更需求" /> }}
          columns={[
            {
              title: '需求编号 / 优先级',
              width: 175,
              render: (_, r) => (
                <Space direction="vertical" size={2}>
                  <Text strong className="mono">
                    {r.code}
                  </Text>
                  <Tag color={PRIORITY_COLOR[r.priority] ?? 'default'}>{r.priority}</Tag>
                </Space>
              ),
            },
            {
              title: '需求标题与变更说明',
              width: 300,
              render: (_, r) => (
                <div>
                  <Text strong>{r.title}</Text>
                  {r.description && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      {r.description}
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: '所属项目',
              width: 160,
              render: (_, r) => (
                <Tag color="geekblue">
                  {r.project_code} · {r.project_name}
                </Tag>
              ),
            },
            {
              title: '关联受影响数据表',
              width: 240,
              render: (_, r) =>
                r.impacted_tables.length > 0 ? (
                  <Space size={[4, 4]} wrap>
                    {r.impacted_tables.map((tbl) => (
                      <Tag
                        key={tbl}
                        color="blue"
                        icon={<TableOutlined />}
                        style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                        className="mono"
                        onClick={() => handleJumpToImpactedTable(tbl)}
                      >
                        {tbl}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">待评估</Text>
                ),
            },
            {
              title: '状态流转',
              width: 135,
              render: (_, r) => (
                <Select
                  size="small"
                  style={{ width: 112 }}
                  value={r.status}
                  onChange={(val) => void handleQuickStatusChange(r, val)}
                  options={STATUS_OPTIONS.map((st) => ({
                    value: st,
                    label: (
                      <Badge
                        status={STATUS_COLOR[st] as 'default' | 'processing' | 'warning' | 'success'}
                        text={st}
                      />
                    ),
                  }))}
                />
              ),
            },
            {
              title: '版本 / 负责人',
              width: 130,
              render: (_, r) => (
                <Space direction="vertical" size={2}>
                  <Tag className="mono">{r.target_version}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {r.assignee}
                  </Text>
                </Space>
              ),
            },
            {
              title: '操作',
              width: 85,
              fixed: 'right',
              render: (_, r) => (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditingItem(r);
                    editForm.setFieldsValue({
                      title: r.title,
                      priority: r.priority,
                      status: r.status,
                      impacted_tables: r.impacted_tables,
                      assignee: r.assignee,
                      target_version: r.target_version,
                      description: r.description,
                    });
                  }}
                >
                  编辑
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Create Requirement Modal */}
      <Modal
        title="新建研发变更需求"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        confirmLoading={submittingCreate}
        width={620}
        okText="确认创建"
        cancelText="取消"
      >
        <Form form={createForm} layout="vertical">
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item
                name="project_id"
                label="所属项目"
                rules={[{ required: true, message: '请选择项目' }]}
              >
                <Select
                  options={projects.map((p) => ({
                    value: p.id,
                    label: `${p.code} · ${p.name}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="target_version" label="目标迭代版本" rules={[{ required: true }]}>
                <Input className="mono" placeholder="v1.2.0" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="title"
            label="需求标题"
            rules={[{ required: true, message: '请输入需求标题' }]}
          >
            <Input placeholder="例如：采购订单增加供应商电子签章状态字段" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <Select
                  options={['P0', 'P1', 'P2', 'P3'].map((p) => ({ value: p, label: p }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="初始状态">
                <Select options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="assignee" label="负责人" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="impacted_tables" label="受影响数据表">
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="选择本次需求涉及变更的数据表"
              options={allTableOptions}
            />
          </Form.Item>

          <Form.Item name="description" label="变更方案说明">
            <Input.TextArea rows={3} placeholder="描述表结构调整内容、索引影响或兼容策略" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Requirement Modal */}
      <Modal
        title={`编辑需求 ${editingItem?.code ?? ''}`}
        open={Boolean(editingItem)}
        onCancel={() => setEditingItem(null)}
        onOk={() => void handleSaveEdit()}
        confirmLoading={submittingEdit}
        width={620}
        okText="保存更新"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="需求标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <Select
                  options={['P0', 'P1', 'P2', 'P3'].map((p) => ({ value: p, label: p }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="当前状态">
                <Select options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="target_version" label="目标版本" rules={[{ required: true }]}>
                <Input className="mono" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="impacted_tables" label="受影响数据表">
                <Select mode="multiple" allowClear showSearch options={allTableOptions} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="assignee" label="负责人" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="变更方案说明">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
