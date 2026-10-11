import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

const date = (name: string) => integer(name, { mode: 'timestamp_ms' });
export const user = sqliteTable('user', {
 id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
 emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false), image: text('image'),
 createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(),
});
export const session = sqliteTable('session', {
 id: text('id').primaryKey(), token: text('token').notNull().unique(), expiresAt: date('expires_at').notNull(),
 userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
 ipAddress: text('ip_address'), userAgent: text('user_agent'), createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(),
}, table => [index('session_user').on(table.userId)]);
export const account = sqliteTable('account', {
 id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
 userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
 accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
 accessTokenExpiresAt: date('access_token_expires_at'), refreshTokenExpiresAt: date('refresh_token_expires_at'),
 scope: text('scope'), password: text('password'), createdAt: date('created_at').notNull(), updatedAt: date('updated_at').notNull(),
}, table => [index('account_user').on(table.userId)]);
export const verification = sqliteTable('verification', {
 id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
 expiresAt: date('expires_at').notNull(), createdAt: date('created_at'), updatedAt: date('updated_at'),
}, table => [index('verification_identifier').on(table.identifier)]);
export const passkey = sqliteTable('passkey', {
 id: text('id').primaryKey(), name: text('name'), publicKey: text('public_key').notNull(),
 userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), credentialID: text('credential_id').notNull().unique(),
 counter: integer('counter').notNull(), deviceType: text('device_type').notNull(), backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
 transports: text('transports'), createdAt: date('created_at'), aaguid: text('aaguid'),
}, table => [index('passkey_user').on(table.userId)]);
export const rateLimit = sqliteTable('rate_limit', {
 id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: integer('last_request').notNull(),
});
export const profile = sqliteTable('profile', {
 userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
 handle: text('handle').notNull(), cosmetic: text('cosmetic').notNull().default('original'),
 localProgress: text('local_progress').notNull().default('{}'), updatedAt: date('updated_at').notNull(),
});
export const verifiedResult = sqliteTable('verified_result', {
 id: text('id').primaryKey(), matchId: text('match_id').notNull(), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
 won: integer('won', { mode: 'boolean' }).notNull(), xp: integer('xp').notNull(), playedAt: date('played_at').notNull(),
 mode: text('mode').notNull(),
}, table => [index('verified_result_user').on(table.userId)]);
