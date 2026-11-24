import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

export class SqliteAdapter {
  constructor(filename=':memory:') {
    this.connection=new DatabaseSync(filename);
    this.queue=Promise.resolve();
    this.connection.exec('PRAGMA foreign_keys=ON;');
  }
  initialize(schema) {
    const initialized=this.connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='roles'").get();
    if(!initialized)this.connection.exec(schema);
  }
  prepare(sql) {
    const connection=this.connection;
    return {
      sql,values:[],
      bind(...values){this.values=values;return this;},
      async all(){return {results:connection.prepare(sql).all(...this.values)};},
      async first(){return connection.prepare(sql).get(...this.values)||null;},
      async run(){const result=connection.prepare(sql).run(...this.values);return {success:true,meta:{changes:Number(result.changes)}};}
    };
  }
  async batch(statements) {
    const operation=this.queue.catch(()=>{}).then(async()=>{
      this.connection.exec('BEGIN IMMEDIATE');
      try {
        const results=[];
        for(const statement of statements)results.push(await statement.run());
        this.connection.exec('COMMIT');
        return results;
      }catch(error){this.connection.exec('ROLLBACK');throw error;}
    });
    this.queue=operation;
    return operation;
  }
  close(){this.connection.close();}
}

export class PostgresAdapter {
  constructor(pool){this.pool=pool;}
  static async connect(connectionString,schema) {
    const {Pool}=await import('pg');
    const pool=new Pool({connectionString,max:5});
    const adapter=new PostgresAdapter(pool);
    const result=await pool.query("SELECT to_regclass('public.roles') present");
    if(!result.rows[0].present)await pool.query(schema.replace(/^PRAGMA.*$/gm,''));
    return adapter;
  }
  prepare(sql) {
    let counter=0;
    const translated=sql.replace(/\?/g,()=>`$${++counter}`);
    const pool=this.pool;
    return {
      sql:translated,values:[],
      bind(...values){this.values=values;return this;},
      async all(){const result=await pool.query(translated,this.values);return {results:result.rows};},
      async first(){const result=await pool.query(translated,this.values);return result.rows[0]||null;},
      async run(){const result=await pool.query(translated,this.values);return {success:true,meta:{changes:result.rowCount}};}
    };
  }
  async batch(statements) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results=[];
      for(const statement of statements){
        const result=await client.query(statement.sql,statement.values);
        results.push({success:true,meta:{changes:result.rowCount}});
      }
      await client.query('COMMIT');
      return results;
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }
  async close(){await this.pool.end();}
}

export class LocalBucket {
  constructor(directory){this.directory=path.resolve(directory);mkdirSync(this.directory,{recursive:true});}
  filename(key) {
    const filename=path.resolve(this.directory,key);
    if(!filename.startsWith(this.directory+path.sep))throw new Error('Invalid object key');
    return filename;
  }
  async put(key,bytes){const filename=this.filename(key);await mkdir(path.dirname(filename),{recursive:true});await writeFile(filename,new Uint8Array(bytes));}
  async get(key){try{const data=await readFile(this.filename(key));return {body:data};}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async delete(key){try{await unlink(this.filename(key));}catch(error){if(error.code!=='ENOENT')throw error;}}
}
