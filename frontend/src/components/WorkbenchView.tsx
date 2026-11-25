import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  SaveOutlined,
  TableOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { api } from '../api/client';
import type { CodegenResponse, SchemaColumn } from '../types';
import {
  fetchDashboard,
  fetchTables,
  setSelectedProjectId,
  setSelectedTableId,
} from '../store/cockpitSlice';
import { useAppDispatch, useAppSelector } from '../store';

const { Text, Title } = Typography;

const DATA_TYPE_OPTIONS = [
  'BIGINT',
  'INT',
  'TINYINT',
  'SMALLINT',
  'VARCHAR',
  'CHAR',
  'TEXT',
  'LONGTEXT',
  'DECIMAL',
  'DOUBLE',
  'FLOAT',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'BOOLEAN',
  'JSON',
].map((t) => ({ value: t, label: t }));

const INDEX_TYPE_OPTIONS: Array<{ value: SchemaColumn['index_type']; label: string }> = [
  { value: 'NONE', label: '无索引' },
  { value: 'PRIMARY', label: 'PRIMARY (主键)' },
  { value: 'UNIQUE', label: 'UNIQUE (唯一)' },
  { value: 'INDEX', label: 'INDEX (普通)' },
];

type EditableColumn = SchemaColumn & { _rowKey: string };

function toEditableColumns(cols: SchemaColumn[]): EditableColumn[] {
  return cols.map((c, idx) => ({
    ...c,
    _rowKey: `col-${c.id ?? 'new'}-${idx}-${Date.now()}`,
  }));
}

export const WorkbenchView: React.FC = () => {
  const dispatch = useAppDispatch();
  const { projects, tables, tablesLoading, selectedProjectId, selectedTableId } = useAppSelector(
    (s) => s.cockpit
  );

  const [tableSearch, setTableSearch] = useState('');
  const [draftColumns, setDraftColumns] = useState<EditableColumn[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savingCols, setSavingCols] = useState(false);

  // Create table modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);
  const [createForm] = Form.useForm();

  // Edit table meta modal
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  const [updatingMeta, setUpdatingMeta] = useState(false);
  const [editMetaForm] = Form.useForm();

  // Codegen drawer
  const [codegenOpen, setCodegenOpen] = useState(false);
  const [codegenLoading, setCodegenLoading] = useState(false);
  const [codegenData, setCodegenData] = useState<CodegenResponse | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState('mysqlDdl');

  const filteredTables = useMemo(() => {
    const kw = tableSearch.trim().toLowerCase();
    return tables.filter((t) => {
      if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false;
      if (!kw) return true;
      return (
        t.table_name.toLowerCase().includes(kw) ||
        t.comment.toLowerCase().includes(kw) ||
        t.module.toLowerCase().includes(kw)
      );
    });
  }, [tables, selectedProjectId, tableSearch]);

  const activeTable = useMemo(() => {
    return (
      tables.find((t) => t.id === selectedTableId) ??
      filteredTables[0] ??
      null
    );
  }, [tables, filteredTables, selectedTableId]);

  useEffect(() => {
    if (activeTable) {
      setDraftColumns(toEditableColumns(activeTable.columns ?? []));
      setDirty(false);
    } else {
      setDraftColumns([]);
      setDirty(false);
    }
  }, [activeTable]);

  const allTableNames = useMemo(
    () => Array.from(new Set(tables.map((t) => t.table_name))).sort(),
    [tables]
  );

  const updateColumnAt = (idx: number, patch: Partial<EditableColumn>) => {
    setDraftColumns((prev) => {
      const next = [...prev];
      const current = { ...next[idx], ...patch };
      if (patch.is_pk === 1) {
        current.is_nullable = 0;
        current.index_type = 'PRIMARY';
      } else if (patch.is_pk === 0 && current.index_type === 'PRIMARY') {
        current.index_type = 'NONE';
      }
      if (patch.index_type === 'PRIMARY') {
        current.is_pk = 1;
        current.is_nullable = 0;
      } else if (patch.index_type && current.is_pk === 1) {
        current.is_pk = 0;
      }
      next[idx] = current;
      return next;
    });
    setDirty(true);
  };

  const handleAddColumn = () => {
    const newCol: EditableColumn = {
      _rowKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `new_col_${draftColumns.length + 1}`,
      data_type: 'VARCHAR',
      length: '64',
      is_pk: 0,
      is_nullable: 1,
      default_val: '',
      index_type: 'NONE',
      comment: '新增业务字段',
      ref_table: '',
      sort_order: draftColumns.length + 1,
    };
    setDraftColumns((prev) => [...prev, newCol]);
    setDirty(true);
  };

  const handleMoveColumn = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= draftColumns.length) return;
    setDraftColumns((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
    setDirty(true);
  };

  const handleRemoveColumn = (idx: number) => {
    if (draftColumns.length <= 1) {
      message.warning('数据表至少需要保留一个字段');
      return;
    }
    setDraftColumns((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleSaveColumns = async (): Promise<boolean> => {
    if (!activeTable) return false;
    const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    for (const col of draftColumns) {
      if (!nameRegex.test(col.name.trim())) {
        message.error(`字段名 "${col.name}" 不合法，仅支持字母、数字与下划线且不能以数字开头`);
        return false;
      }
    }
    const names = draftColumns.map((c) => c.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      message.error('同一张表内存在重复的字段名，请检查');
      return false;
    }

    setSavingCols(true);
    try {
      const payload: SchemaColumn[] = draftColumns.map((c, idx) => ({
        name: c.name.trim(),
        data_type: c.data_type,
        length: c.length.trim(),
        is_pk: c.is_pk,
        is_nullable: c.is_nullable,
        default_val: c.default_val.trim(),
        index_type: c.is_pk ? 'PRIMARY' : c.index_type,
        comment: c.comment.trim(),
        ref_table: c.ref_table.trim(),
        sort_order: idx + 1,
      }));
      await api.saveTableColumns(activeTable.id, payload);
      message.success(`已保存表 ${activeTable.table_name} 的 ${payload.length} 个字段定义`);
      setDirty(false);
      await dispatch(fetchTables('all'));
      dispatch(fetchDashboard());
      return true;
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存字段失败');
      return false;
    } finally {
      setSavingCols(false);
    }
  };

  const handleCreateTable = async () => {
    try {
      const values = await createForm.validateFields();
      setCreatingTable(true);
      const created = await api.createTable(values);
      message.success(`数据表 ${created.table_name} 创建成功，已初始化主键与创建时间字段`);
      setCreateModalOpen(false);
      createForm.resetFields();
      await dispatch(fetchTables('all'));
      dispatch(setSelectedTableId(created.id));
      dispatch(fetchDashboard());
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '创建数据表失败');
    } finally {
      setCreatingTable(false);
    }
  };

  const handleUpdateTableMeta = async () => {
    if (!activeTable) return;
    try {
      const values = await editMetaForm.validateFields();
      setUpdatingMeta(true);
      await api.updateTable(activeTable.id, values);
      message.success('表元信息已更新');
      setEditMetaOpen(false);
      await dispatch(fetchTables('all'));
      dispatch(fetchDashboard());
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '更新表元信息失败');
    } finally {
      setUpdatingMeta(false);
    }
  };

  const handleDeleteTable = async (id: number, tableName: string) => {
    try {
      await api.deleteTable(id);
      message.success(`已删除数据表 ${tableName}`);
      await dispatch(fetchTables('all'));
      dispatch(fetchDashboard());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除数据表失败');
    }
  };

  const openCodegenDrawer = async () => {
    if (!activeTable) return;
    if (dirty) {
      const saved = await handleSaveColumns();
      if (!saved) return;
    }
    setCodegenOpen(true);
    setCodegenLoading(true);
    try {
      const res = await api.getCodegen(activeTable.id);
      setCodegenData(res);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '获取生成代码失败');
    } finally {
      setCodegenLoading(false);
    }
  };

  const copyCode = async (code: string, label: string) => {
    try {
      await navigator.clipboard.writeText(code);
      message.success(`已复制 ${label} 代码到剪贴板`);
    } catch {
      message.error('剪贴板复制失败，请手动选中复制');
    }
  };

  const codeArtifactsMap: Record<string, { label: string; code: string }> = {
    mysqlDdl: {
      label: 'MySQL 8 DDL',
      code: codegenData?.artifacts.mysqlDdl ?? '',
    },
    typescriptZod: {
      label: 'TypeScript + Zod',
      code: codegenData?.artifacts.typescriptZod ?? '',
    },
    javaJpa: {
      label: 'Java 21 JPA Entity',
      code: codegenData?.artifacts.javaJpa ?? '',
    },
    mybatisXml: {
      label: 'MyBatis CRUD XML',
      code: codegenData?.artifacts.mybatisXml ?? '',
    },
  };

  return (
    <Row gutter={16} align="stretch">
      {/* Left Sidebar: Project Switcher + Table List */}
      <Col xs={24} md={7} lg={6}>
        <Card
          className="cockpit-card"
          title={
            <Space>
              <TableOutlined style={{ color: '#2563eb' }} />
              <span>数据表目录 ({filteredTables.length})</span>
            </Space>
          }
          extra={
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                const defaultProj =
                  selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id;
                createForm.setFieldsValue({
                  project_id: defaultProj,
                  engine: 'InnoDB',
                  module: '核心域',
                });
                setCreateModalOpen(true);
              }}
            >
              建表
            </Button>
          }
          bodyStyle={{ padding: 12 }}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Select
              style={{ width: '100%' }}
              value={selectedProjectId}
              onChange={(val) => dispatch(setSelectedProjectId(val))}
              options={[
                { value: 'all', label: '全部项目资产' },
                ...projects.map((p) => ({
                  value: p.id,
                  label: `${p.code} · ${p.name}`,
                })),
              ]}
            />
            <Input
              allowClear
              placeholder="筛选表名 / 注释 / 模块"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
            />
          </Space>

          <div
            style={{
              marginTop: 12,
              maxHeight: 'calc(100vh - 300px)',
              minHeight: 360,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {filteredTables.length === 0 ? (
              <Empty description="当前条件下暂无数据表" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              filteredTables.map((t) => {
                const isActive = activeTable?.id === t.id;
                return (
                  <div
                    key={t.id}
                    className={`table-list-item ${isActive ? 'active' : ''}`}
                    onClick={() => dispatch(setSelectedTableId(t.id))}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Text strong className="mono" style={{ fontSize: 13 }} ellipsis>
                        {t.table_name}
                      </Text>
                      <Badge
                        count={t.columns?.length ?? 0}
                        color={isActive ? '#2563eb' : '#94a3b8'}
                        showZero
                      />
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {t.comment || '暂无备注'}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {t.project_code && (
                        <Tag style={{ fontSize: 11, marginInlineEnd: 0 }} color="geekblue">
                          {t.project_code}
                        </Tag>
                      )}
                      <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>{t.module}</Tag>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </Col>

      {/* Right Workspace: Table Metadata + Editable Columns + Codegen Trigger */}
      <Col xs={24} md={17} lg={18}>
        <Card className="cockpit-card" loading={tablesLoading && !activeTable}>
          {!activeTable ? (
            <Empty description="请从左侧选择或新建一张数据表" />
          ) : (
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              {/* Table Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 12,
                  paddingBottom: 12,
                  borderBottom: '1px solid #e5eaf3',
                }}
              >
                <div>
                  <Space size={8} wrap>
                    <Title level={4} style={{ margin: 0 }} className="mono">
                      {activeTable.table_name}
                    </Title>
                    <Tag color="geekblue">{activeTable.project_code || `P#${activeTable.project_id}`}</Tag>
                    <Tag color="cyan">{activeTable.module}</Tag>
                    <Tag>{activeTable.engine}</Tag>
                    {dirty && <Tag color="warning">有未保存变更</Tag>}
                  </Space>
                  <div style={{ marginTop: 6, color: '#475569', fontSize: 13 }}>
                    {activeTable.comment || '暂无表描述'} · 更新于 {activeTable.updated_at}
                  </div>
                </div>

                <Space wrap>
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => {
                      editMetaForm.setFieldsValue({
                        table_name: activeTable.table_name,
                        comment: activeTable.comment,
                        engine: activeTable.engine,
                        module: activeTable.module,
                      });
                      setEditMetaOpen(true);
                    }}
                  >
                    表元信息
                  </Button>
                  <Button
                    type="primary"
                    ghost
                    icon={<CodeOutlined />}
                    onClick={() => void openCodegenDrawer()}
                  >
                    代码生成 (DDL / TS / JPA / MyBatis)
                  </Button>
                  <Popconfirm
                    title={`确定删除表 ${activeTable.table_name}？`}
                    description="删除后其下所有字段定义将一并清除"
                    onConfirm={() => void handleDeleteTable(activeTable.id, activeTable.table_name)}
                    okText="确认删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button danger icon={<DeleteOutlined />}>
                      删除表
                    </Button>
                  </Popconfirm>
                </Space>
              </div>

              {dirty && (
                <Alert
                  type="warning"
                  showIcon
                  message="当前字段结构已修改但尚未保存到数据库，点击「保存字段结构」后生效（代码生成将自动先保存）。"
                />
              )}

              {/* Column Editor Toolbar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <Space>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddColumn}>
                    新增字段
                  </Button>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    共 {draftColumns.length} 个字段 · 支持直接内联编辑 PK / 可空 / 索引 / 外键引用
                  </Text>
                </Space>
                <Space>
                  <Button
                    disabled={!dirty}
                    icon={<UndoOutlined />}
                    onClick={() => {
                      setDraftColumns(toEditableColumns(activeTable.columns ?? []));
                      setDirty(false);
                    }}
                  >
                    还原
                  </Button>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={savingCols}
                    disabled={!dirty}
                    onClick={() => void handleSaveColumns()}
                  >
                    保存字段结构
                  </Button>
                </Space>
              </div>

              {/* Editable Column Table */}
              <Table<EditableColumn>
                rowKey="_rowKey"
                size="small"
                pagination={false}
                scroll={{ x: 1120 }}
                dataSource={draftColumns}
                columns={[
                  {
                    title: '序',
                    width: 44,
                    align: 'center',
                    render: (_, __, idx) => <Text type="secondary">{idx + 1}</Text>,
                  },
                  {
                    title: '字段名',
                    width: 165,
                    render: (_, record, idx) => (
                      <Input
                        size="small"
                        className="mono"
                        value={record.name}
                        onChange={(e) => updateColumnAt(idx, { name: e.target.value })}
                      />
                    ),
                  },
                  {
                    title: '类型',
                    width: 130,
                    render: (_, record, idx) => (
                      <Select
                        size="small"
                        style={{ width: '100%' }}
                        value={record.data_type}
                        options={DATA_TYPE_OPTIONS}
                        onChange={(val) => updateColumnAt(idx, { data_type: val })}
                      />
                    ),
                  },
                  {
                    title: '长度',
                    width: 82,
                    render: (_, record, idx) => (
                      <Input
                        size="small"
                        className="mono"
                        placeholder="如 64"
                        value={record.length}
                        onChange={(e) => updateColumnAt(idx, { length: e.target.value })}
                      />
                    ),
                  },
                  {
                    title: 'PK / 可空 / 索引',
                    width: 245,
                    render: (_, record, idx) => (
                      <Space size={6} wrap>
                        <Tooltip title="主键 (PK)">
                          <Checkbox
                            checked={record.is_pk === 1}
                            onChange={(e) =>
                              updateColumnAt(idx, { is_pk: e.target.checked ? 1 : 0 })
                            }
                          >
                            {record.is_pk === 1 ? (
                              <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                                <KeyOutlined /> PK
                              </Tag>
                            ) : (
                              <span style={{ fontSize: 12 }}>PK</span>
                            )}
                          </Checkbox>
                        </Tooltip>
                        <Tooltip title="是否允许为 NULL">
                          <Checkbox
                            checked={record.is_nullable === 1}
                            disabled={record.is_pk === 1}
                            onChange={(e) =>
                              updateColumnAt(idx, { is_nullable: e.target.checked ? 1 : 0 })
                            }
                          >
                            <Tag
                              color={record.is_nullable === 1 ? 'default' : 'red'}
                              style={{ marginInlineEnd: 0, fontSize: 11 }}
                            >
                              {record.is_nullable === 1 ? 'NULL' : 'NOT NULL'}
                            </Tag>
                          </Checkbox>
                        </Tooltip>
                        <Select
                          size="small"
                          style={{ width: 108 }}
                          value={record.is_pk === 1 ? 'PRIMARY' : record.index_type}
                          disabled={record.is_pk === 1}
                          options={INDEX_TYPE_OPTIONS}
                          onChange={(val) => updateColumnAt(idx, { index_type: val })}
                        />
                      </Space>
                    ),
                  },
                  {
                    title: '默认值',
                    width: 135,
                    render: (_, record, idx) => (
                      <Input
                        size="small"
                        className="mono"
                        placeholder="可选"
                        value={record.default_val}
                        onChange={(e) => updateColumnAt(idx, { default_val: e.target.value })}
                      />
                    ),
                  },
                  {
                    title: '关联外键表 (FK)',
                    width: 175,
                    render: (_, record, idx) => (
                      <Select
                        size="small"
                        allowClear
                        showSearch
                        style={{ width: '100%' }}
                        placeholder="无外键关联"
                        value={record.ref_table || undefined}
                        options={allTableNames
                          .filter((name) => name !== activeTable.table_name)
                          .map((name) => ({ value: name, label: name }))}
                        onChange={(val) => updateColumnAt(idx, { ref_table: val ?? '' })}
                        suffixIcon={record.ref_table ? <LinkOutlined style={{ color: '#10b981' }} /> : undefined}
                      />
                    ),
                  },
                  {
                    title: '注释',
                    width: 180,
                    render: (_, record, idx) => (
                      <Input
                        size="small"
                        value={record.comment}
                        onChange={(e) => updateColumnAt(idx, { comment: e.target.value })}
                      />
                    ),
                  },
                  {
                    title: '操作',
                    width: 96,
                    fixed: 'right',
                    render: (_, __, idx) => (
                      <Space size={2}>
                        <Button
                          size="small"
                          type="text"
                          icon={<ArrowUpOutlined />}
                          disabled={idx === 0}
                          onClick={() => handleMoveColumn(idx, -1)}
                        />
                        <Button
                          size="small"
                          type="text"
                          icon={<ArrowDownOutlined />}
                          disabled={idx === draftColumns.length - 1}
                          onClick={() => handleMoveColumn(idx, 1)}
                        />
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveColumn(idx)}
                        />
                      </Space>
                    ),
                  },
                ]}
              />
            </Space>
          )}
        </Card>
      </Col>

      {/* Create Table Modal */}
      <Modal
        title="新建数据表"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => void handleCreateTable()}
        confirmLoading={creatingTable}
        okText="立即创建"
        cancelText="取消"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="project_id"
            label="所属项目"
            rules={[{ required: true, message: '请选择所属项目' }]}
          >
            <Select
              options={projects.map((p) => ({
                value: p.id,
                label: `${p.code} · ${p.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="table_name"
            label="数据表名"
            rules={[
              { required: true, message: '请输入数据表名' },
              {
                pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
                message: '仅支持字母、数字与下划线，且不能以数字开头',
              },
            ]}
          >
            <Input className="mono" placeholder="例如：scm_settlement_bill" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="module" label="业务域 / 模块">
                <Input placeholder="例如：清结算域" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="engine" label="存储引擎">
                <Select
                  options={[
                    { value: 'InnoDB', label: 'InnoDB' },
                    { value: 'MyISAM', label: 'MyISAM' },
                    { value: 'MEMORY', label: 'MEMORY' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="comment" label="表中文备注">
            <Input placeholder="例如：供应商月度对账结算单表" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Table Meta Modal */}
      <Modal
        title="编辑表元信息"
        open={editMetaOpen}
        onCancel={() => setEditMetaOpen(false)}
        onOk={() => void handleUpdateTableMeta()}
        confirmLoading={updatingMeta}
        okText="保存修改"
        cancelText="取消"
      >
        <Form form={editMetaForm} layout="vertical">
          <Form.Item
            name="table_name"
            label="数据表名"
            rules={[
              { required: true, message: '请输入表名' },
              { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '表名格式不合法' },
            ]}
          >
            <Input className="mono" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="module" label="业务模块">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="engine" label="存储引擎">
                <Select
                  options={[
                    { value: 'InnoDB', label: 'InnoDB' },
                    { value: 'MyISAM', label: 'MyISAM' },
                    { value: 'MEMORY', label: 'MEMORY' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="comment" label="表中文备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Codegen Drawer */}
      <Drawer
        title={
          <Space>
            <CodeOutlined style={{ color: '#2563eb' }} />
            <span>多语言代码实时生成器</span>
            {activeTable && (
              <Tag color="blue" className="mono">
                {activeTable.table_name}
              </Tag>
            )}
          </Space>
        }
        width={820}
        open={codegenOpen}
        onClose={() => setCodegenOpen(false)}
        extra={
          <Button
            type="primary"
            icon={<CopyOutlined />}
            disabled={!codegenData}
            onClick={() => {
              const target = codeArtifactsMap[activeCodeTab];
              if (target) void copyCode(target.code, target.label);
            }}
          >
            一键复制当前代码
          </Button>
        }
      >
        <Tabs
          activeKey={activeCodeTab}
          onChange={setActiveCodeTab}
          items={Object.entries(codeArtifactsMap).map(([key, item]) => ({
            key,
            label: item.label,
            children: codegenLoading ? (
              <Card loading />
            ) : (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    基于表 <span className="mono">{activeTable?.table_name}</span>（
                    {codegenData?.columns.length ?? 0} 个字段）实时生成
                  </Text>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void copyCode(item.code, item.label)}
                  >
                    复制 {item.label}
                  </Button>
                </div>
                <pre className="code-viewer">{item.code}</pre>
              </div>
            ),
          }))}
        />
      </Drawer>
    </Row>
  );
};
