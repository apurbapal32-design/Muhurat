import { relations } from 'drizzle-orm';
import { doublePrecision, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').default('Trader').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const watchlists = pgTable('watchlists', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  symbol: text('symbol').notNull(),
  notes: text('notes').default(''),
  targetPrice: doublePrecision('target_price').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const journalEntries = pgTable('journal_entries', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),
  entryPrice: doublePrecision('entry_price').notNull(),
  stopLoss: doublePrecision('stop_loss').notNull(),
  targetPrice: doublePrecision('target_price').notNull(),
  strategy: text('strategy').notNull(),
  status: text('status').default('OPEN').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const scannerAlerts = pgTable('scanner_alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  symbol: text('symbol').notNull(),
  strategy: text('strategy').notNull(),
  triggerPrice: doublePrecision('trigger_price').notNull(),
  status: text('status').default('ACTIVE').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  watchlists: many(watchlists),
  journalEntries: many(journalEntries),
  scannerAlerts: many(scannerAlerts),
}));

export const watchlistsRelations = relations(watchlists, ({ one }) => ({
  user: one(users, {
    fields: [watchlists.userId],
    references: [users.id],
  }),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one }) => ({
  user: one(users, {
    fields: [journalEntries.userId],
    references: [users.id],
  }),
}));

export const scannerAlertsRelations = relations(scannerAlerts, ({ one }) => ({
  user: one(users, {
    fields: [scannerAlerts.userId],
    references: [users.id],
  }),
}));
