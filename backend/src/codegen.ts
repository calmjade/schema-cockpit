import type { CodegenArtifacts, SchemaColumn, SchemaTable } from './types.js';

function toPascalCase(input: string): string {
  return input
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(input: string): string {
  const pascal = toPascalCase(input);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : input;
}

function formatMysqlColumnType(col: SchemaColumn): string {
  const upper = col.data_type.toUpperCase();
  if (col.length && !['DATE', 'DATETIME', 'TIMESTAMP', 'TEXT', 'LONGTEXT', 'JSON'].includes(upper)) {
    return `${upper}(${col.length})`;
  }
  return upper;
}

function mapToTsType(col: SchemaColumn): { ts: string; zod: string } {
  const upper = col.data_type.toUpperCase();
  if (['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC'].includes(upper)) {
    if (upper === 'TINYINT' && col.length === '1') {
      return { ts: 'number | boolean', zod: 'z.union([z.number().int(), z.boolean()])' };
    }
    return { ts: 'number', zod: 'z.number()' };
  }
  if (['BOOLEAN', 'BOOL'].includes(upper)) {
    return { ts: 'boolean', zod: 'z.boolean()' };
  }
  if (['JSON'].includes(upper)) {
    return { ts: 'Record<string, unknown>', zod: 'z.record(z.unknown())' };
  }
  return { ts: 'string', zod: 'z.string()' };
}

function mapToJavaType(col: SchemaColumn): { javaType: string; needsBigDecimal: boolean; needsLocalDateTime: boolean; needsLocalDate: boolean } {
  const upper = col.data_type.toUpperCase();
  if (upper === 'BIGINT') return { javaType: 'Long', needsBigDecimal: false, needsLocalDateTime: false, needsLocalDate: false };
  if (['INT', 'INTEGER', 'SMALLINT', 'TINYINT'].includes(upper)) {
    return { javaType: 'Integer', needsBigDecimal: false, needsLocalDateTime: false, needsLocalDate: false };
  }
  if (['DECIMAL', 'NUMERIC'].includes(upper)) {
    return { javaType: 'BigDecimal', needsBigDecimal: true, needsLocalDateTime: false, needsLocalDate: false };
  }
  if (['FLOAT', 'DOUBLE'].includes(upper)) {
    return { javaType: 'Double', needsBigDecimal: false, needsLocalDateTime: false, needsLocalDate: false };
  }
  if (['BOOLEAN', 'BOOL'].includes(upper)) {
    return { javaType: 'Boolean', needsBigDecimal: false, needsLocalDateTime: false, needsLocalDate: false };
  }
  if (['DATETIME', 'TIMESTAMP'].includes(upper)) {
    return { javaType: 'LocalDateTime', needsBigDecimal: false, needsLocalDateTime: true, needsLocalDate: false };
  }
  if (upper === 'DATE') {
    return { javaType: 'LocalDate', needsBigDecimal: false, needsLocalDateTime: false, needsLocalDate: true };
  }
  return { javaType: 'String', needsBigDecimal: false, needsLocalDateTime: false, needsLocalDate: false };
}

function generateMysqlDdl(table: SchemaTable, columns: SchemaColumn[]): string {
  const lines: string[] = [];
  const pkCols: string[] = [];
  const indexLines: string[] = [];

  for (const col of columns) {
    const colType = formatMysqlColumnType(col);
    const nullClause = col.is_nullable ? 'NULL' : 'NOT NULL';
    let defaultClause = '';
    if (col.default_val === 'AUTO_INCREMENT') {
      defaultClause = 'AUTO_INCREMENT';
    } else if (col.default_val === 'CURRENT_TIMESTAMP') {
      defaultClause = 'DEFAULT CURRENT_TIMESTAMP';
    } else if (col.default_val !== '') {
      const isNumeric = /^(INT|BIGINT|TINYINT|SMALLINT|DECIMAL|FLOAT|DOUBLE)/i.test(col.data_type) && !Number.isNaN(Number(col.default_val));
      defaultClause = isNumeric ? `DEFAULT ${col.default_val}` : `DEFAULT '${col.default_val.replace(/'/g, "\\'")}'`;
    } else if (col.is_nullable) {
      defaultClause = 'DEFAULT NULL';
    }

    const commentClause = col.comment ? `COMMENT '${col.comment.replace(/'/g, "\\'")}'` : '';
    const parts = [`  \`${col.name}\` ${colType}`, nullClause, defaultClause, commentClause].filter(Boolean);
    lines.push(parts.join(' '));

    if (col.is_pk) {
      pkCols.push(`\`${col.name}\``);
    } else if (col.index_type === 'UNIQUE') {
      indexLines.push(`  UNIQUE KEY \`uk_${table.table_name}_${col.name}\` (\`${col.name}\`)`);
    } else if (col.index_type === 'INDEX') {
      indexLines.push(`  KEY \`idx_${table.table_name}_${col.name}\` (\`${col.name}\`)`);
    }
  }

  if (pkCols.length > 0) {
    lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
  }
  lines.push(...indexLines);

  const engine = table.engine || 'InnoDB';
  const tableComment = table.comment ? ` COMMENT='${table.comment.replace(/'/g, "\\'")}'` : '';
  return `CREATE TABLE IF NOT EXISTS \`${table.table_name}\` (\n${lines.join(',\n')}\n) ENGINE=${engine} DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${tableComment};`;
}

function generateTypescriptZod(table: SchemaTable, columns: SchemaColumn[]): string {
  const className = toPascalCase(table.table_name);
  const schemaName = `${className}Schema`;

  const interfaceFields = columns.map((col) => {
    const { ts } = mapToTsType(col);
    const opt = col.is_nullable ? '?' : '';
    const nullUnion = col.is_nullable ? ' | null' : '';
    const commentLine = col.comment ? `  /** ${col.comment}${col.ref_table ? ` (FK -> ${col.ref_table})` : ''} */\n` : '';
    return `${commentLine}  ${toCamelCase(col.name)}${opt}: ${ts}${nullUnion};`;
  });

  const zodFields = columns.map((col) => {
    const { zod } = mapToTsType(col);
    let expr = zod;
    if (col.is_nullable) {
      expr += '.nullable().optional()';
    }
    if (col.comment) {
      expr += `.describe('${col.comment.replace(/'/g, "\\'")}')`;
    }
    return `  ${toCamelCase(col.name)}: ${expr},`;
  });

  return `import { z } from 'zod';

/**
 * ${table.comment || table.table_name}
 * 表名: ${table.table_name} | 所属模块: ${table.module}
 */
export interface ${className} {
${interfaceFields.join('\n')}
}

export const ${schemaName} = z.object({
${zodFields.join('\n')}
});

export type ${className}Input = z.infer<typeof ${schemaName}>;
`;
}

function generateJavaJpa(table: SchemaTable, columns: SchemaColumn[]): string {
  const className = toPascalCase(table.table_name);
  let needsBigDecimal = false;
  let needsLocalDateTime = false;
  let needsLocalDate = false;

  const mapped = columns.map((col) => {
    const info = mapToJavaType(col);
    if (info.needsBigDecimal) needsBigDecimal = true;
    if (info.needsLocalDateTime) needsLocalDateTime = true;
    if (info.needsLocalDate) needsLocalDate = true;
    return { col, javaType: info.javaType };
  });

  const imports = [
    'import jakarta.persistence.*;',
    'import lombok.Data;',
  ];
  if (needsBigDecimal) imports.push('import java.math.BigDecimal;');
  if (needsLocalDate) imports.push('import java.time.LocalDate;');
  if (needsLocalDateTime) imports.push('import java.time.LocalDateTime;');

  const fields = mapped.map(({ col, javaType }) => {
    const fieldName = toCamelCase(col.name);
    const annotations: string[] = [];
    if (col.comment) {
      annotations.push(`    /**\n     * ${col.comment}${col.ref_table ? ` (关联表: ${col.ref_table})` : ''}\n     */`);
    }
    if (col.is_pk) {
      annotations.push('    @Id');
      if (col.default_val === 'AUTO_INCREMENT' || ['BIGINT', 'INT'].includes(col.data_type.toUpperCase())) {
        annotations.push('    @GeneratedValue(strategy = GenerationType.IDENTITY)');
      }
    }
    const colArgs: string[] = [`name = "${col.name}"`];
    if (!col.is_nullable) colArgs.push('nullable = false');
    if (col.index_type === 'UNIQUE') colArgs.push('unique = true');
    if (col.length && !col.length.includes(',') && !['BIGINT', 'INT', 'TINYINT', 'SMALLINT', 'DATE', 'DATETIME', 'TIMESTAMP'].includes(col.data_type.toUpperCase())) {
      colArgs.push(`length = ${col.length}`);
    }
    annotations.push(`    @Column(${colArgs.join(', ')})`);
    annotations.push(`    private ${javaType} ${fieldName};`);
    return annotations.join('\n');
  });

  return `package com.calmjade.cockpit.entity;

${imports.join('\n')}

/**
 * ${table.comment || table.table_name}
 * Module: ${table.module}
 */
@Data
@Entity
@Table(name = "${table.table_name}")
public class ${className} {

${fields.join('\n\n')}
}
`;
}

function generateMybatisXml(table: SchemaTable, columns: SchemaColumn[]): string {
  const className = toPascalCase(table.table_name);
  const pkCol = columns.find((c) => c.is_pk === 1) ?? columns[0];
  const pkName = pkCol ? pkCol.name : 'id';
  const pkProp = toCamelCase(pkName);

  const resultEntries = columns.map((col) => {
    const prop = toCamelCase(col.name);
    const tag = col.is_pk ? 'id' : 'result';
    return `        <${tag} column="${col.name}" property="${prop}" />`;
  });

  const baseCols = columns.map((c) => `\`${c.name}\``).join(', ');
  const insertCols = columns.filter((c) => !(c.is_pk && c.default_val === 'AUTO_INCREMENT'));
  const insertColNames = insertCols.map((c) => `\`${c.name}\``).join(', ');
  const insertColProps = insertCols.map((c) => `#{${toCamelCase(c.name)}}`).join(', ');

  const updateSets = insertCols.map(
    (c) => `            <if test="${toCamelCase(c.name)} != null">\`${c.name}\` = #{${toCamelCase(c.name)}},</if>`
  );

  return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.calmjade.cockpit.mapper.${className}Mapper">

    <resultMap id="BaseResultMap" type="com.calmjade.cockpit.entity.${className}">
${resultEntries.join('\n')}
    </resultMap>

    <sql id="Base_Column_List">
        ${baseCols}
    </sql>

    <select id="selectById" resultMap="BaseResultMap">
        SELECT <include refid="Base_Column_List" />
        FROM \`${table.table_name}\`
        WHERE \`${pkName}\` = #{${pkProp}}
    </select>

    <select id="selectList" resultMap="BaseResultMap">
        SELECT <include refid="Base_Column_List" />
        FROM \`${table.table_name}\`
        ORDER BY \`${pkName}\` DESC
    </select>

    <insert id="insert" parameterType="com.calmjade.cockpit.entity.${className}" useGeneratedKeys="true" keyProperty="${pkProp}">
        INSERT INTO \`${table.table_name}\` (${insertColNames})
        VALUES (${insertColProps})
    </insert>

    <update id="updateById" parameterType="com.calmjade.cockpit.entity.${className}">
        UPDATE \`${table.table_name}\`
        <set>
${updateSets.join('\n')}
        </set>
        WHERE \`${pkName}\` = #{${pkProp}}
    </update>

    <delete id="deleteById">
        DELETE FROM \`${table.table_name}\`
        WHERE \`${pkName}\` = #{${pkProp}}
    </delete>

</mapper>
`;
}

export function generateCodeArtifacts(table: SchemaTable, columns: SchemaColumn[]): CodegenArtifacts {
  return {
    mysqlDdl: generateMysqlDdl(table, columns),
    typescriptZod: generateTypescriptZod(table, columns),
    javaJpa: generateJavaJpa(table, columns),
    mybatisXml: generateMybatisXml(table, columns),
  };
}
