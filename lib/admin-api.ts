import {adminPasswordRoutes,adminPasswordStatus} from './admin-password.ts';
import { activityOverview } from './activity.ts';
import { ApiError, json, payload } from './http.ts';
import { adminAccess } from './admin-access.ts';
import { isArchived, KEEP_VOTES, NOTE_ARCHIVE_DAYS } from './product.ts';
import { validatePost } from './content.ts';
import { snapshot, istInput, type AdminPost, type Snapshot } from './admin-model.ts';
const select=`SELECT p.id,p.kind,p.body,p.place,p.lng,p.lat,p.created_at AS createdAt,p.starts_at AS startsAt,p.ends_at AS endsAt,p.hidden_at AS hiddenAt,p.revision,
 (SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) AS votes,
 (SELECT COUNT(*) FROM reports r WHERE r.post_id=p.id) AS reportCount,
 (SELECT COUNT(*) FROM reports r WHERE r.post_id=p.id AND r.resolution_id IS NULL) AS openReports FROM posts p`;
const old=`(((p.kind='note' AND p.created_at<=?) OR (p.kind='event' AND p.ends_at<=?)) AND (SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) < ?)`;
const present=(post:AdminPost)=>({...post,archived:isArchived(post)});
const validId=(value:string)=>/^[a-f0-9-]{36}$/.test(value);
function pageCursor(value:string|null){if(!value)return null;const m=value.match(/^(\d{13}):([a-f0-9-]{36})$/);if(!m)throw new ApiError('Refresh this list to continue.');return [Number(m[1]),m[2]] as const;}
async function find(db:D1Database,id:string){const p=await db.prepare(`${select} WHERE p.id=?`).bind(id).first<AdminPost>();if(!p)throw new ApiError('This entry is no longer available.',404);return p;}
function checkedState(raw:Snapshot):Snapshot{
 const checked=validatePost({...raw,startsAt:istInput(raw.startsAt),endsAt:istInput(raw.endsAt)},Date.now(),{allowPastEvents:true});
 if(checked.error)throw new ApiError(checked.error,422);
 return {...checked.value!,hiddenAt:raw.hiddenAt};
}
export async function adminRoutes(request:Request,url:URL,db:D1Database|undefined,ownerEmail:string|undefined){
 const access=adminAccess(request.headers,ownerEmail);if(access.status!==200)throw new ApiError(access.message,access.status);
 if(!db)throw new ApiError('The database is temporarily unavailable.',503);
 if(request.method==='POST'&&request.headers.get('origin')!==url.origin)throw new ApiError('Use this dashboard to make changes.',403);
 const path=url.pathname;
 if(path.startsWith('/api/admin/auth/'))return adminPasswordRoutes(request,url,db,ownerEmail);
 const local=url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(!(await adminPasswordStatus(request.headers,db,access.userId,local)).unlocked)return json({error:'Enter your admin password to continue.',code:'ADMIN_LOCKED'},401);
 if(path==='/api/admin/overview'&&request.method==='GET')return activityOverview(url,db);
 if(path==='/api/admin/session'&&request.method==='GET')return json({owner:true});
 if(path==='/api/admin/posts'&&request.method==='GET'){
   const kind=url.searchParams.get('kind')??'all',view=url.searchParams.get('view')??'all',visibility=url.searchParams.get('visibility')??'all',reported=url.searchParams.get('reported')??'all',search=(url.searchParams.get('q')??'').trim();
   if(!['all','note','event'].includes(kind)||!['all','current','archive'].includes(view)||!['all','visible','hidden'].includes(visibility)||!['all','open','any'].includes(reported)||search.length>256)throw new ApiError('Choose valid entry filters.');
   const clauses:string[]=[],values:(string|number)[]=[],now=Date.now();
   if(kind!=='all'){clauses.push('p.kind=?');values.push(kind);}
   if(view!=='all'){clauses.push(view==='archive'?old:`NOT ${old}`);values.push(now-NOTE_ARCHIVE_DAYS*86400000,now,KEEP_VOTES);}
   if(visibility!=='all')clauses.push(`p.hidden_at IS ${visibility==='visible'?'':'NOT '}NULL`);
   if(reported!=='all')clauses.push(`EXISTS(SELECT 1 FROM reports r WHERE r.post_id=p.id${reported==='open'?' AND r.resolution_id IS NULL':''})`);
   if(search){clauses.push("(p.place LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')");const term='%'+search.replace(/[\\%_]/g,'\\$&')+'%';values.push(term,term);}
   const where=clauses.length?clauses.join(' AND '):'1=1';
   const count=await db.prepare(`SELECT COUNT(*) AS total FROM posts p WHERE ${where}`).bind(...values).first<{total:number}>();
   const cursor=pageCursor(url.searchParams.get('cursor'));
   if(cursor){clauses.push('(p.created_at<? OR (p.created_at=? AND p.id<?))');values.push(cursor[0],cursor[0],cursor[1]);}
   const rows=await db.prepare(`${select} WHERE ${clauses.length?clauses.join(' AND '):'1=1'} ORDER BY p.created_at DESC,p.id DESC LIMIT 26`).bind(...values).all<AdminPost>();
   const posts=rows.results.slice(0,25),last=posts.at(-1);
   return json({posts:posts.map(present),total:count?.total??0,nextCursor:rows.results.length>25&&last?`${last.createdAt}:${last.id}`:null});
 }
 const match=path.match(/^\/api\/admin\/posts\/([a-f0-9-]{36})(?:\/(history|change))?$/);
 if(!match||!validId(match[1]))throw new ApiError('Not found.',404);
 const [,id,operation]=match,post=await find(db,id);
 if(request.method==='GET'){
   const cursor=pageCursor(url.searchParams.get('cursor'));
   const rows=await db.prepare(`SELECT id,action,created_at AS createdAt,revision,before_json AS beforeJson,after_json AS afterJson FROM admin_history WHERE post_id=?${cursor?' AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT 26`).bind(id,...cursor?[cursor[0],cursor[0],cursor[1]]:[]).all<{id:string;action:string;createdAt:number;revision:number;beforeJson:string;afterJson:string}>();
   const history=rows.results.slice(0,25).map(({beforeJson,afterJson,...entry})=>({...entry,before:snapshot(JSON.parse(beforeJson)),after:snapshot(JSON.parse(afterJson))})),last=history.at(-1),nextHistory=rows.results.length>25&&last?`${last.createdAt}:${last.id}`:null;
   if(operation==='history')return json({history,nextHistory});
   if(operation)throw new ApiError('Not found.',404);
   const reports=await db.prepare('SELECT reason,SUM(CASE WHEN resolution_id IS NULL THEN 1 ELSE 0 END) AS open,SUM(CASE WHEN resolution_id IS NOT NULL THEN 1 ELSE 0 END) AS resolved,MAX(created_at) AS latest FROM reports WHERE post_id=? GROUP BY reason').bind(id).all();
   return json({post:present(post),reports:reports.results,history,nextHistory});
 }
 if(request.method!=='POST'||operation!=='change')throw new ApiError('Not found.',404);
 const data=await payload(request);
 if(!Number.isInteger(data.revision)||data.revision!==post.revision)throw new ApiError('This entry changed. Reload it before saving.',409);
 const before=snapshot(post);let after=before;const action=data.action;
 if(action==='edit'){
   const checked=validatePost({...data,kind:post.kind},Date.now(),{allowPastEvents:true});if(checked.error)throw new ApiError(checked.error,422);after={...checked.value!,hiddenAt:post.hiddenAt};
 }else if(action==='hide')after={...before,hiddenAt:Date.now()};
 else if(action==='restore')after=checkedState({...before,hiddenAt:null});
 else if(action==='version'){
   if(typeof data.historyId!=='string'||!validId(data.historyId))throw new ApiError('Choose a history version.');
   const history=await db.prepare('SELECT before_json AS state FROM admin_history WHERE post_id=? AND id=? AND action IN (\'edit\',\'hide\',\'restore\',\'version\')').bind(id,data.historyId).first<{state:string}>();
   if(!history)throw new ApiError('That version is unavailable.',404);after=checkedState(snapshot(JSON.parse(history.state)));
 }else if(action!=='resolve'&&action!=='reopen')throw new ApiError('Choose an available action.');
 if(action==='reopen'&&(typeof data.historyId!=='string'||!validId(data.historyId)))throw new ApiError('Choose a report resolution.');
 if(action==='reopen'&&!await db.prepare("SELECT id FROM admin_history WHERE id=? AND post_id=? AND action='resolve'").bind(data.historyId,id).first())throw new ApiError('That resolution is unavailable.',404);
 const auditId=crypto.randomUUID(),at=Date.now(),revision=post.revision+1;
 const statements=[
   db.prepare('INSERT INTO admin_history (id,post_id,actor_id,action,created_at,before_json,after_json,revision) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=?)').bind(auditId,id,access.userId,action,at,JSON.stringify(before),JSON.stringify(after),revision,id,post.revision),
   db.prepare('UPDATE posts SET body=?,place=?,lng=?,lat=?,starts_at=?,ends_at=?,hidden_at=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM admin_history WHERE id=?)').bind(after.body,after.place,after.lng,after.lat,after.startsAt,after.endsAt,after.hiddenAt,id,post.revision,auditId),
 ];
 if(action==='resolve')statements.push(db.prepare('UPDATE reports SET resolution_id=? WHERE post_id=? AND resolution_id IS NULL AND EXISTS(SELECT 1 FROM admin_history WHERE id=?)').bind(auditId,id,auditId));
 if(action==='reopen')statements.push(db.prepare('UPDATE reports SET resolution_id=NULL WHERE post_id=? AND resolution_id=? AND EXISTS(SELECT 1 FROM admin_history WHERE id=?)').bind(id,data.historyId,auditId));
 const result=await db.batch(statements);
 if(!result[1].meta.changes)throw new ApiError('This entry changed. Reload it before saving.',409);
 return json({post:present(await find(db,id))});
}
