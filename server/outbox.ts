import { DatabaseSync } from 'node:sqlite';
import type { Winner } from './arena.ts';

/** A win is durable locally before any success is sent; replay to Postgres is idempotent. */
export class AwardOutbox {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, winners TEXT NOT NULL)');
  }
  enqueue(id:string,winners:Winner[]):Winner[] {
    this.db.prepare('INSERT OR IGNORE INTO outbox VALUES (?,?)').run(id,JSON.stringify(winners));
    return JSON.parse(String(this.db.prepare('SELECT winners FROM outbox WHERE id=?').get(id)!.winners));
  }
  pending():{id:string;winners:Winner[]}[] {return this.db.prepare('SELECT id,winners FROM outbox').all().map(r=>({id:String(r.id),winners:JSON.parse(String(r.winners))}));}
  delivered(id:string):void {this.db.prepare('DELETE FROM outbox WHERE id=?').run(id);}
  close():void {this.db.close();}
}
