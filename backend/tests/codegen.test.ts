import { describe, expect, it } from 'vitest';
import { generateCodeArtifacts } from '../src/codegen.js';
import type { SchemaColumn, SchemaTable } from '../src/types.js';

describe('generateCodeArtifacts', () => {
  const sampleTable: SchemaTable = {
    id: 1,
    project_id: 1,
    table_name: 'scm_purchase_order',
    comment: '供应链采购订单表',
    engine: 'InnoDB',
    module: '采购域',
    created_at: '2026-11-01 00:00:00',
    updated_at: '2026-11-01 00:00:00',
  };

  const sampleCols: SchemaColumn[] = [
    {
      id: 1,
      table_id: 1,
      name: 'id',
      data_type: 'BIGINT',
      length: '20',
      is_pk: 1,
      is_nullable: 0,
      default_val: 'AUTO_INCREMENT',
      index_type: 'PRIMARY',
      comment: '主键ID',
      ref_table: '',
      sort_order: 1,
    },
    {
      id: 2,
      table_id: 1,
      name: 'order_amount',
      data_type: 'DECIMAL',
      length: '12,2',
      is_pk: 0,
      is_nullable: 0,
      default_val: '0.00',
      index_type: 'NONE',
      comment: '订单总金额',
      ref_table: '',
      sort_order: 2,
    },
  ];

  it('generates valid MySQL DDL, TypeScript+Zod, Java JPA, and MyBatis XML artifacts', () => {
    const out = generateCodeArtifacts(sampleTable, sampleCols);
    expect(out.mysqlDdl).toContain('CREATE TABLE IF NOT EXISTS `scm_purchase_order`');
    expect(out.mysqlDdl).toContain('`order_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00');
    expect(out.typescriptZod).toContain('export interface ScmPurchaseOrder');
    expect(out.typescriptZod).toContain('orderAmount: number');
    expect(out.javaJpa).toContain('@Entity');
    expect(out.javaJpa).toContain('private BigDecimal orderAmount;');
    expect(out.mybatisXml).toContain('<mapper');
    expect(out.mybatisXml).toContain('SELECT <include refid="Base_Column_List" />');
  });
});
