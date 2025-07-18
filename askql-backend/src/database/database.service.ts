import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import * as mysql from 'mysql2/promise';
import * as sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export interface DatabaseConfig {
  type: 'postgresql' | 'mysql' | 'sqlite';
  url: string;
}

export interface TableSchema {
  tableName: string;
  columns: Array<{
    columnName: string;
    dataType: string;
    isNullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    referencedTable?: string;
    referencedColumn?: string;
  }>;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private connection: any;
  private config: DatabaseConfig;

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private parseConnectionString(url: string): DatabaseConfig {
    const urlObj = new URL(url);

    let type: 'postgresql' | 'mysql' | 'sqlite';

    switch (urlObj.protocol) {
      case 'postgresql:':
      case 'postgres:':
        type = 'postgresql';
        break;
      case 'mysql:':
        type = 'mysql';
        break;
      case 'sqlite:':
      case 'file:':
        type = 'sqlite';
        break;
      default:
        throw new Error(`Unsupported database type: ${urlObj.protocol}`);
    }

    return { type, url };
  }

  private async connect() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.config = this.parseConnectionString(databaseUrl);

    try {
      switch (this.config.type) {
        case 'postgresql':
          this.connection = new Pool({ connectionString: this.config.url });
          break;

        case 'mysql':
          this.connection = await mysql.createConnection(this.config.url);
          break;

        case 'sqlite':
          const dbPath = this.config.url
            .replace('sqlite:', '')
            .replace('file:', '');
          this.connection = await open({
            filename: dbPath,
            driver: sqlite3.Database,
          });
          break;

        default:
          throw new Error(`Unsupported database type: ${this.config.type}`);
      }

      console.log(`✅ Connected to ${this.config.type} database`);
    } catch (error) {
      throw new Error(`Failed to connect to database: ${error.message}`);
    }
  }

  private async disconnect() {
    if (this.connection) {
      try {
        switch (this.config.type) {
          case 'postgresql':
            await this.connection.end();
            break;
          case 'mysql':
            await this.connection.end();
            break;
          case 'sqlite':
            await this.connection.close();
            break;
        }
        console.log(`✅ Disconnected from ${this.config.type} database`);
      } catch (error) {
        console.error('Error disconnecting from database:', error.message);
      }
    }
  }

  // Dynamically get schema information for any database
  async getSchemaInfo(): Promise<{ [tableName: string]: any }> {
    try {
      const tables = await this.getTables();
      const schema: { [tableName: string]: any } = {};

      for (const table of tables) {
        const columns = await this.getTableColumns(table.tableName);
        const relationships = await this.getTableRelationships(table.tableName);

        schema[table.tableName] = {
          description: `Table: ${table.tableName}`,
          columns: columns.reduce(
            (acc, col) => {
              let columnDesc = col.dataType;
              if (col.isPrimaryKey) columnDesc += ' (primary key)';
              if (col.isForeignKey)
                columnDesc += ` (foreign key to ${col.referencedTable}.${col.referencedColumn})`;
              if (!col.isNullable) columnDesc += ' (required)';
              acc[col.columnName] = columnDesc;
              return acc;
            },
            {} as { [key: string]: string },
          ),
          relationships: relationships,
        };
      }

      return schema;
    } catch (error) {
      throw new Error(`Failed to get schema info: ${error.message}`);
    }
  }

  private async getTables(): Promise<Array<{ tableName: string }>> {
    let query: string;

    switch (this.config.type) {
      case 'postgresql':
        query = `
          SELECT table_name as "tableName"
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `;
        break;

      case 'mysql':
        query = `
          SELECT table_name as tableName
          FROM information_schema.tables 
          WHERE table_schema = DATABASE()
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `;
        break;

      case 'sqlite':
        query = `
          SELECT name as tableName 
          FROM sqlite_master 
          WHERE type = 'table' 
          AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `;
        break;

      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }

    const result = await this.executeQuery(query);
    return result;
  }

  private async getTableColumns(
    tableName: string,
  ): Promise<TableSchema['columns']> {
    let query: string;
    let params: any[] = [];

    switch (this.config.type) {
      case 'postgresql':
        query = `
          SELECT 
            c.column_name as "columnName",
            c.data_type as "dataType",
            c.is_nullable = 'YES' as "isNullable",
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as "isPrimaryKey",
            CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as "isForeignKey",
            fk.foreign_table_name as "referencedTable",
            fk.foreign_column_name as "referencedColumn"
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT ku.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
            WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
          ) pk ON c.column_name = pk.column_name
          LEFT JOIN (
            SELECT 
              ku.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
          ) fk ON c.column_name = fk.column_name
          WHERE c.table_name = $1
          ORDER BY c.ordinal_position
        `;
        params = [tableName];
        break;

      case 'mysql':
        query = `
          SELECT 
            c.column_name as columnName,
            c.data_type as dataType,
            c.is_nullable = 'YES' as isNullable,
            c.column_key = 'PRI' as isPrimaryKey,
            c.column_key = 'MUL' as isForeignKey,
            kcu.referenced_table_name as referencedTable,
            kcu.referenced_column_name as referencedColumn
          FROM information_schema.columns c
          LEFT JOIN information_schema.key_column_usage kcu 
            ON c.table_name = kcu.table_name 
            AND c.column_name = kcu.column_name 
            AND kcu.referenced_table_name IS NOT NULL
          WHERE c.table_name = ?
          ORDER BY c.ordinal_position
        `;
        params = [tableName];
        break;

      case 'sqlite':
        query = `PRAGMA table_info(${tableName})`;
        params = [];
        break;

      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }

    const result = await this.executeQuery(query, params);

    if (this.config.type === 'sqlite') {
      // Transform SQLite pragma result to match our interface
      return result.map((row: any) => ({
        columnName: row.name,
        dataType: row.type,
        isNullable: !row.notnull,
        isPrimaryKey: !!row.pk,
        isForeignKey: false, // We'll handle this separately for SQLite
        referencedTable: null,
        referencedColumn: null,
      }));
    }

    return result;
  }

  private async getTableRelationships(tableName: string): Promise<string[]> {
    // Simplified relationship detection
    const relationships: string[] = [];

    try {
      const columns = await this.getTableColumns(tableName);
      for (const column of columns) {
        if (column.isForeignKey && column.referencedTable) {
          relationships.push(
            `${tableName}.${column.columnName} -> ${column.referencedTable}.${column.referencedColumn}`,
          );
        }
      }
    } catch (error) {
      console.error('Error getting table relationships:', error.message);
    }

    return relationships;
  }

  // Safe method to execute read-only queries
  async executeReadOnlyQuery(sql: string): Promise<any[]> {
    // Ensure the query is read-only (starts with SELECT or EXPLAIN)
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT') && !trimmedSql.startsWith('EXPLAIN')) {
      throw new Error('Only SELECT and EXPLAIN queries are allowed for safety');
    }

    try {
      const result = await this.executeQuery(sql);
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      throw new Error(`SQL execution failed: ${error.message}`);
    }
  }

  // Method specifically for validating SQL syntax using EXPLAIN
  async validateQuerySyntax(
    sqlQuery: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      let explainQuery: string;
      switch (this.config.type) {
        case 'postgresql':
        case 'mysql':
          explainQuery = `EXPLAIN ${sqlQuery}`;
          break;
        case 'sqlite':
          explainQuery = `EXPLAIN QUERY PLAN ${sqlQuery}`;
          break;
        default:
          explainQuery = `EXPLAIN ${sqlQuery}`;
      }

      await this.executeQuery(explainQuery);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
      };
    }
  }

  private async executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    try {
      switch (this.config.type) {
        case 'postgresql':
          const pgResult = await this.connection.query(sql, params);
          return pgResult.rows;

        case 'mysql':
          const [mysqlRows] = await this.connection.execute(sql, params);
          return mysqlRows as any[];

        case 'sqlite':
          const sqliteResult = await this.connection.all(sql, params);
          return sqliteResult;

        default:
          throw new Error(`Unsupported database type: ${this.config.type}`);
      }
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  // Test database connectivity
  async testConnection(): Promise<{
    connected: boolean;
    error?: string;
    dbType?: string;
  }> {
    try {
      let testQuery: string;

      switch (this.config.type) {
        case 'postgresql':
          testQuery = 'SELECT 1 as test';
          break;
        case 'mysql':
          testQuery = 'SELECT 1 as test';
          break;
        case 'sqlite':
          testQuery = 'SELECT 1 as test';
          break;
        default:
          throw new Error(`Unsupported database type: ${this.config.type}`);
      }

      await this.executeQuery(testQuery);
      return {
        connected: true,
        dbType: this.config.type,
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        dbType: this.config.type,
      };
    }
  }

  // Add methods that agents expect (compatibility with Prisma-like interface)
  // Supports both tagged-template and direct string calls.
  public $queryRaw = async (
    first: TemplateStringsArray | string,
    ...substitutions: any[]
  ): Promise<any[]> => {
    let sql: string;
    let params: any[];

    // If called with a plain SQL string
    if (typeof first === 'string') {
      sql = first;
      params = substitutions;
    } else {
      // Called as a tagged template (e.g. this.$queryRaw`SELECT 1`)
      // Naively interpolate values – agents only use literals for simple tests.
      sql = first
        .map(
          (chunk, i) =>
            chunk + (i < substitutions.length ? substitutions[i] : ''),
        )
        .join('');
      params = [];
    }

    return this.executeQuery(sql, params);
  };

  public $queryRawUnsafe = async (
    sql: string,
    ...params: any[]
  ): Promise<any[]> => {
    // No safety checks – defer directly to executeQuery
    return this.executeQuery(sql, params);
  };
}
