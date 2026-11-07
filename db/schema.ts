import { integer, real, sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['note', 'event'] }).notNull(),
  body: text('body').notNull(),
  place: text('place').notNull(),
  lng: real('lng').notNull(),
  lat: real('lat').notNull(),
  createdAt: integer('created_at').notNull(),
  startsAt: integer('starts_at'),
  endsAt: integer('ends_at'),
  deleteHash: text('delete_hash').notNull(),
  hiddenAt: integer('hidden_at'),
  revision: integer('revision').notNull().default(0),
}, table => [index('posts_created').on(table.createdAt)]);

export const votes = sqliteTable('votes', {
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
}, table => [primaryKey({ columns: [table.postId, table.tokenHash] })]);

export const budgets = sqliteTable('budgets', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('budgets_expiry').on(table.expiresAt)]);

export const reports = sqliteTable('reports', {
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  reason: text('reason').notNull(),
  resolutionId: text('resolution_id'),
  createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.postId, table.tokenHash] })]);

export const adminHistory = sqliteTable('admin_history', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  createdAt: integer('created_at').notNull(),
  beforeJson: text('before_json').notNull(),
  afterJson: text('after_json').notNull(),
  revision: integer('revision').notNull(),
}, table => [index('admin_history_post').on(table.postId,table.createdAt)]);

// Anonymous daily counters. No visitor IDs, addresses, user agents or event logs.
export const activityDaily=sqliteTable('activity_daily',{
 day:text('day').notNull(),
 locationKey:text('location_key').notNull(),
 place:text('place').notNull(),
 lng:real('lng'),lat:real('lat'),
 views:integer('views').notNull().default(0),
},table=>[primaryKey({columns:[table.day,table.locationKey]})]);
export const activityMeta=sqliteTable('activity_meta',{
 key:text('key').primaryKey(),
 value:integer('value').notNull(),
});
