import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  CompressOutlined,
  KeyOutlined,
  LinkOutlined,
  ReloadOutlined,
  SendOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { api } from '../api/client';
import type { ErEdge, ErNode } from '../types';
import { jumpToTable, setSelectedProjectId } from '../store/cockpitSlice';
import { useAppDispatch, useAppSelector } from '../store';

const { Text } = Typography;

const NODE_WIDTH = 280;
const HEADER_HEIGHT = 48;
const ROW_HEIGHT = 24;
const PADDING_BOTTOM = 8;

const PROJECT_COLORS = ['#2563eb', '#0891b2', '#059669', '#7c3aed', '#d97706'];

function getNodeHeight(node: ErNode): number {
  return HEADER_HEIGHT + Math.max(node.columns.length, 1) * ROW_HEIGHT + PADDING_BOTTOM;
}

export const ErDiagramView: React.FC = () => {
  const dispatch = useAppDispatch();
  const { projects, selectedProjectId } = useAppSelector((s) => s.cockpit);

  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<ErNode[]>([]);
  const [edges, setEdges] = useState<ErEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const [zoom, setZoom] = useState(0.95);
  const [pan, setPan] = useState({ x: 30, y: 20 });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<
    | { type: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number }
    | { type: 'node'; nodeId: number; startX: number; startY: number; origX: number; origY: number }
    | null
  >(null);

  const loadGraph = useCallback(async (projectId: number | 'all') => {
    setLoading(true);
    try {
      const data = await api.getErGraph(projectId);
      setNodes(data.nodes);
      setEdges(data.edges);
      setSelectedNodeId(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载 ER 拓扑图失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGraph(selectedProjectId);
  }, [selectedProjectId, loadGraph]);

  const handleAutoLayout = () => {
    setNodes((prev) =>
      prev.map((node, index) => {
        const colIdx = index % 3;
        const rowIdx = Math.floor(index / 3);
        return {
          ...node,
          x: 60 + colIdx * 360,
          y: 50 + rowIdx * 340,
        };
      })
    );
    setZoom(0.95);
    setPan({ x: 30, y: 20 });
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('.er-node-card')) return;
    dragStateRef.current = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
  };

  const handleNodeMouseDown = (e: React.MouseEvent, node: ErNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    dragStateRef.current = {
      type: 'node',
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    if (drag.type === 'pan') {
      setPan({
        x: drag.origPanX + (e.clientX - drag.startX),
        y: drag.origPanY + (e.clientY - drag.startY),
      });
    } else if (drag.type === 'node') {
      const dx = (e.clientX - drag.startX) / zoom;
      const dy = (e.clientY - drag.startY) / zoom;
      setNodes((prev) =>
        prev.map((n) =>
          n.id === drag.nodeId
            ? { ...n, x: Math.round(drag.origX + dx), y: Math.round(drag.origY + dy) }
            : n
        )
      );
    }
  };

  const handleMouseUp = () => {
    dragStateRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => Math.min(2.0, Math.max(0.35, Number((z + delta).toFixed(2)))));
  };

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const relatedNodeIds = useMemo(() => {
    if (selectedNodeId === null) return new Set<number>();
    const set = new Set<number>([selectedNodeId]);
    for (const edge of edges) {
      if (edge.source_table_id === selectedNodeId) set.add(edge.target_table_id);
      if (edge.target_table_id === selectedNodeId) set.add(edge.source_table_id);
    }
    return set;
  }, [selectedNodeId, edges]);

  const selectedNode = selectedNodeId !== null ? nodeMap.get(selectedNodeId) ?? null : null;

  return (
    <Card
      className="cockpit-card"
      bodyStyle={{ padding: 14 }}
      title={
        <Space wrap>
          <ApartmentOutlined style={{ color: '#2563eb' }} />
          <span>交互式 ER 关系拓扑图</span>
          <Tag color="blue">{nodes.length} 个实体</Tag>
          <Tag color="green">{edges.length} 条外键连线</Tag>
        </Space>
      }
      extra={
        <Space wrap>
          <Select
            style={{ width: 220 }}
            value={selectedProjectId}
            onChange={(val) => dispatch(setSelectedProjectId(val))}
            options={[
              { value: 'all', label: '全部项目拓扑（含跨库引用）' },
              ...projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
            ]}
          />
          <Button
            icon={<ZoomOutOutlined />}
            onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.1).toFixed(2))))}
          />
          <Tag style={{ marginInlineEnd: 0, minWidth: 52, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </Tag>
          <Button
            icon={<ZoomInOutlined />}
            onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(2))))}
          />
          <Tooltip title="自动重置节点排布与画布视角">
            <Button icon={<CompressOutlined />} onClick={handleAutoLayout}>
              重置布局
            </Button>
          </Tooltip>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void loadGraph(selectedProjectId)}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <div className="er-canvas-wrapper">
        {loading ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Spin tip="正在构建实体关系拓扑..." />
          </div>
        ) : nodes.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty description="当前项目暂无数据表实体" />
          </div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ cursor: 'grab', display: 'block' }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <defs>
              <marker
                id="er-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
              </marker>
              <marker
                id="er-arrow-active"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" />
              </marker>
              <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="125%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.1" />
              </filter>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Foreign Key Edges */}
              {edges.map((edge) => {
                const src = nodeMap.get(edge.source_table_id);
                const tgt = nodeMap.get(edge.target_table_id);
                if (!src || !tgt) return null;

                const srcColIdx = Math.max(
                  0,
                  src.columns.findIndex((c) => c.name === edge.source_column)
                );
                const srcY = src.y + HEADER_HEIGHT + srcColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                const tgtY = tgt.y + HEADER_HEIGHT / 2;

                const srcCenterX = src.x + NODE_WIDTH / 2;
                const tgtCenterX = tgt.x + NODE_WIDTH / 2;
                const goRight = tgtCenterX >= srcCenterX;

                const startX = goRight ? src.x + NODE_WIDTH : src.x;
                const endX = goRight ? tgt.x : tgt.x + NODE_WIDTH;
                const dx = Math.max(Math.abs(endX - startX) * 0.5, 65);
                const c1x = goRight ? startX + dx : startX - dx;
                const c2x = goRight ? endX - dx : endX + dx;

                const isHighlighted =
                  hoveredEdgeId === edge.id ||
                  selectedNodeId === edge.source_table_id ||
                  selectedNodeId === edge.target_table_id;

                const midX = (startX + endX) / 2;
                const midY = (srcY + tgtY) / 2;

                return (
                  <g
                    key={edge.id}
                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <path
                      d={`M ${startX} ${srcY} C ${c1x} ${srcY}, ${c2x} ${tgtY}, ${endX} ${tgtY}`}
                      fill="none"
                      stroke={isHighlighted ? '#2563eb' : '#94a3b8'}
                      strokeWidth={isHighlighted ? 2.4 : 1.6}
                      strokeDasharray={isHighlighted ? undefined : '5 3'}
                      markerEnd={isHighlighted ? 'url(#er-arrow-active)' : 'url(#er-arrow)'}
                    />
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-68}
                        y={-10}
                        width={136}
                        height={20}
                        rx={10}
                        fill={isHighlighted ? '#eff6ff' : '#ffffff'}
                        stroke={isHighlighted ? '#2563eb' : '#cbd5e1'}
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={4}
                        textAnchor="middle"
                        fontSize={10}
                        fontFamily="JetBrains Mono, Consolas, monospace"
                        fill={isHighlighted ? '#1d4ed8' : '#475569'}
                      >
                        {edge.source_column}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Entity Table Nodes */}
              {nodes.map((node) => {
                const totalH = getNodeHeight(node);
                const headerColor = PROJECT_COLORS[(node.project_id - 1) % PROJECT_COLORS.length];
                const isSelected = selectedNodeId === node.id;
                const isDimmed = selectedNodeId !== null && !relatedNodeIds.has(node.id);

                return (
                  <g
                    key={node.id}
                    className="er-node-card"
                    transform={`translate(${node.x}, ${node.y})`}
                    opacity={isDimmed ? 0.45 : 1}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  >
                    <rect
                      width={NODE_WIDTH}
                      height={totalH}
                      rx={10}
                      fill="#ffffff"
                      stroke={isSelected ? '#2563eb' : '#cbd5e1'}
                      strokeWidth={isSelected ? 2.2 : 1.2}
                      filter="url(#node-shadow)"
                    />
                    {/* Header Bar */}
                    <path
                      d={`M 0 10 Q 0 0 10 0 L ${NODE_WIDTH - 10} 0 Q ${NODE_WIDTH} 0 ${NODE_WIDTH} 10 L ${NODE_WIDTH} ${HEADER_HEIGHT} L 0 ${HEADER_HEIGHT} Z`}
                      fill={headerColor}
                    />
                    <text
                      x={12}
                      y={20}
                      fill="#ffffff"
                      fontSize={13}
                      fontWeight={700}
                      fontFamily="JetBrains Mono, Consolas, monospace"
                    >
                      {node.table_name}
                    </text>
                    <text x={12} y={38} fill="rgba(255,255,255,0.86)" fontSize={11}>
                      {node.comment || node.module} · {node.project_code}
                    </text>

                    {/* Columns */}
                    {node.columns.map((col, idx) => {
                      const rowY = HEADER_HEIGHT + idx * ROW_HEIGHT;
                      return (
                        <g key={`${node.id}-${col.name}`} transform={`translate(0, ${rowY})`}>
                          {idx % 2 === 1 && (
                            <rect x={1} y={0} width={NODE_WIDTH - 2} height={ROW_HEIGHT} fill="#f8fafc" />
                          )}
                          <text
                            x={12}
                            y={16}
                            fontSize={11}
                            fill={col.is_pk ? '#d97706' : col.ref_table ? '#059669' : '#64748b'}
                          >
                            {col.is_pk ? 'PK' : col.ref_table ? 'FK' : '•'}
                          </text>
                          <text
                            x={34}
                            y={16}
                            fontSize={11.5}
                            fontWeight={col.is_pk ? 600 : 400}
                            fontFamily="JetBrains Mono, Consolas, monospace"
                            fill="#0f172a"
                          >
                            {col.name}
                          </text>
                          <text
                            x={NODE_WIDTH - 12}
                            y={16}
                            textAnchor="end"
                            fontSize={10.5}
                            fontFamily="JetBrains Mono, Consolas, monospace"
                            fill="#64748b"
                          >
                            {col.data_type}
                            {col.length ? `(${col.length})` : ''}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* Bottom Floating Legend & Quick Action */}
        <div
          style={{
            position: 'absolute',
            left: 14,
            bottom: 14,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(6px)',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            fontSize: 12,
          }}
        >
          <Text type="secondary">操作：拖拽节点调整位置 · 拖拽空白处平移画布 · 滚轮缩放</Text>
          <Tag color="gold" style={{ marginInlineEnd: 0 }}>
            <KeyOutlined /> PK 主键
          </Tag>
          <Tag color="green" style={{ marginInlineEnd: 0 }}>
            <LinkOutlined /> FK 外键关联
          </Tag>
          {selectedNode && (
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              onClick={() =>
                dispatch(
                  jumpToTable({
                    projectId: selectedNode.project_id,
                    tableId: selectedNode.id,
                  })
                )
              }
            >
              编辑 {selectedNode.table_name}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
