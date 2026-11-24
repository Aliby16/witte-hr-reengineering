import { neon } from '@neondatabase/serverless';

// Параметры преобразуются отдельно от строк, имён и комментариев SQL.
export function postgresParameters(sql) {
  let result = '', position = 0, index = 0, quote = '', block = 0, dollar = '';
  while (index < sql.length) {
    const char = sql[index], pair = sql.slice(index,index+2);
    if (dollar) {
      if (sql.startsWith(dollar,index)) { result+=dollar;index+=dollar.length;dollar=''; }
      else { result+=char;index++; }
      continue;
    }
    if (block) {
      if (pair==='/*') { block++;result+=pair;index+=2; }
      else if (pair==='*/') { block--;result+=pair;index+=2; }
      else { result+=char;index++; }
      continue;
    }
    if (quote) {
      result+=char;index++;
      if(char===quote) {
        if(sql[index]===quote) {result+=sql[index++];}
        else quote='';
      }
      continue;
    }
    if (pair==='--') {
      const end=sql.indexOf('\n',index);
      if(end<0) {result+=sql.slice(index);break;}
      result+=sql.slice(index,end+1);index=end+1;continue;
    }
    if (pair==='/*') {block=1;result+=pair;index+=2;continue;}
    if (char==='"'||char==="'") {quote=char;result+=char;index++;continue;}
    const tag=char==='$'?sql.slice(index).match(/^\$(?:[A-Za-z_]\w*)?\$/):null;
    if(tag) {dollar=tag[0];result+=dollar;index+=dollar.length;continue;}
    result+=char==='?'?'$'+(++position):char;
    index++;
  }
  return result;
}

export function postgresRows(result) {
  const integers=(result.fields||[]).filter(field=>field.dataTypeID===20).map(field=>field.name);
  return (result.rows||[]).map(row=>{
    const converted={...row};
    for(const name of integers) {
      const value=converted[name];
      if(typeof value==='string'&&/^-?\d+$/.test(value)&&Number.isSafeInteger(Number(value)))converted[name]=Number(value);
    }
    return converted;
  });
}

export class NeonAdapter {
  constructor(connectionString) {
    this.client=neon(connectionString,{fullResults:true,arrayMode:false});
  }
  prepare(sql) {
    const text=postgresParameters(sql),client=this.client;
    return {
      sql:text,values:[],
      bind(...values){this.values=values;return this;},
      async all(){return {results:postgresRows(await client.query(text,this.values))};},
      async first(){return postgresRows(await client.query(text,this.values))[0]||null;},
      async run(){const result=await client.query(text,this.values);return {success:true,meta:{changes:Number(result.rowCount||0)}};}
    };
  }
  async batch(statements) {
    if(!statements.length)return [];
    // Ленивые запросы передаются в одну транзакцию до первого await.
    const results=await this.client.transaction(statements.map(s=>this.client.query(s.sql,s.values)),
      {fullResults:true,arrayMode:false});
    return results.map(result=>({success:true,meta:{changes:Number(result.rowCount||0)}}));
  }
  async close() {}
}
