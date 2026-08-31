import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new Statement(this.database, this.sql, values); }
  run() {
    const result = this.database.sqlite.prepare(this.sql).run(...this.values);
    return Promise.resolve({ success: true, meta: { changes: Number(result.changes) } });
  }
  first() {
    return Promise.resolve(this.database.sqlite.prepare(this.sql).get(...this.values) ?? null);
  }
  all() {
    return Promise.resolve({ results: this.database.sqlite.prepare(this.sql).all(...this.values) });
  }
}

export class SqliteD1Adapter {
  constructor(schema) {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(schema);
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.sqlite.close(); }
}

