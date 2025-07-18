import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface SQLExecutionInput {
  sqlQuery: string;
  isValidated: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SQLExecutionOutput {
  success: boolean;
  data?: any[];
  error?: string;
  executionTime: number;
  rowCount: number;
  metadata: {
    columnInfo: Array<{
      name: string;
      type: string;
    }>;
  };
}

@Injectable()
export class SQLExecutionAgent {
  private readonly MAX_ROWS = 1000;
  private readonly TIMEOUT_MS = 30000;

  constructor(private databaseService: DatabaseService) {}

  async executeSQL(input: SQLExecutionInput): Promise<SQLExecutionOutput> {
    const startTime = Date.now();

    if (!input.isValidated) {
      return {
        success: false,
        error: 'Query must be validated before execution',
        executionTime: Date.now() - startTime,
        rowCount: 0,
        metadata: { columnInfo: [] },
      };
    }

    if (input.riskLevel === 'HIGH') {
      return {
        success: false,
        error: 'High-risk queries are not allowed to execute',
        executionTime: Date.now() - startTime,
        rowCount: 0,
        metadata: { columnInfo: [] },
      };
    }

    const trimmedQuery = input.sqlQuery.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      return {
        success: false,
        error: 'Only SELECT queries are allowed',
        executionTime: Date.now() - startTime,
        rowCount: 0,
        metadata: { columnInfo: [] },
      };
    }

    try {
      let queryToExecute = input.sqlQuery;
      queryToExecute = queryToExecute.trim().replace(/;+$/, '');

      const isAggregateQuery =
        /\b(COUNT|SUM|AVG|MAX|MIN|GROUP\s+BY)\s*\(/i.test(queryToExecute) ||
        /\bCOUNT\s*\(\s*\*\s*\)/i.test(queryToExecute);

      if (
        !queryToExecute.toUpperCase().includes('LIMIT') &&
        !isAggregateQuery
      ) {
        queryToExecute += ` LIMIT ${this.MAX_ROWS}`;
      }

      console.log('Original query:', input.sqlQuery);
      console.log('Modified query:', queryToExecute);

      const result = await Promise.race([
        this.databaseService.executeReadOnlyQuery(queryToExecute),
        this.createTimeoutPromise(this.TIMEOUT_MS),
      ]);

      const executionTime = Date.now() - startTime;

      const dataArray = Array.isArray(result) ? result : [result];

      const columnInfo = this.extractColumnInfo(dataArray);

      return {
        success: true,
        data: dataArray,
        executionTime,
        rowCount: dataArray.length,
        metadata: {
          columnInfo,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        error: error.message,
        executionTime,
        rowCount: 0,
        metadata: { columnInfo: [] },
      };
    }
  }

  private async createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  private extractColumnInfo(
    data: any[],
  ): Array<{ name: string; type: string }> {
    if (!data || data.length === 0) {
      return [];
    }

    const firstRow = data[0];
    if (!firstRow || typeof firstRow !== 'object') {
      return [];
    }

    return Object.keys(firstRow).map((key) => ({
      name: key,
      type: this.getJavaScriptType(firstRow[key]),
    }));
  }

  private getJavaScriptType(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }

    if (typeof value === 'boolean') {
      return 'boolean';
    }

    if (value instanceof Date) {
      return 'date';
    }

    if (typeof value === 'string') {
      if (
        value.match(/^\d{4}-\d{2}-\d{2}/) ||
        value.match(/^\d{2}\/\d{2}\/\d{4}/)
      ) {
        return 'datetime';
      }
      return 'string';
    }

    if (Array.isArray(value)) {
      return 'array';
    }

    if (typeof value === 'object') {
      return 'object';
    }

    return 'unknown';
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.databaseService.$queryRaw`SELECT 1 as test`;
      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  async getExecutionPlan(
    sqlQuery: string,
  ): Promise<{ plan?: any[]; error?: string }> {
    try {
      const plan = await this.databaseService.$queryRawUnsafe(
        `EXPLAIN ANALYZE ${sqlQuery}`,
      );
      return { plan: Array.isArray(plan) ? plan : [plan] };
    } catch (error) {
      return { error: error.message };
    }
  }
}
