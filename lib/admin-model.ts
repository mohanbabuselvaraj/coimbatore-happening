import type { Post } from './product';
export type AdminPost=Post&{hiddenAt:number|null;revision:number;reportCount:number;openReports:number;archived:boolean};
export type Snapshot=Pick<AdminPost,'kind'|'body'|'place'|'lng'|'lat'|'startsAt'|'endsAt'|'hiddenAt'>;
export type HistoryEntry={id:string;action:string;createdAt:number;revision:number;before:Snapshot;after:Snapshot};
export type ReportSummary={reason:string;open:number;resolved:number;latest:number};
export type EntryDetail={post:AdminPost;reports:ReportSummary[];history:HistoryEntry[];nextHistory:string|null};
export const snapshot=(post:Snapshot):Snapshot=>({kind:post.kind,body:post.body,place:post.place,lng:post.lng,lat:post.lat,startsAt:post.startsAt,endsAt:post.endsAt,hiddenAt:post.hiddenAt});
export const istInput=(value:number|null)=>value===null?'':new Date(value+19800000).toISOString().slice(0,16);
