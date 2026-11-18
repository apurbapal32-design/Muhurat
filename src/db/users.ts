import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { scannerAlerts, users, watchlists } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  try {
    const cleanName = (displayName || email.split('@')[0] || 'Trader').slice(0, 80);
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: cleanName,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user account. Please try again later.', { cause: error });
  }
}

export async function getUserWatchlist(uid: string) {
  try {
    return await db
      .select({
        id: watchlists.id,
        symbol: watchlists.symbol,
        notes: watchlists.notes,
        targetPrice: watchlists.targetPrice,
        createdAt: watchlists.createdAt,
      })
      .from(watchlists)
      .innerJoin(users, eq(watchlists.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(watchlists.createdAt));
  } catch (error) {
    console.error('Database watchlist query failed:', error);
    throw new Error('Failed to load watchlist. Please try again later.', { cause: error });
  }
}

export async function addUserWatchlistItem(
  uid: string,
  email: string,
  input: { symbol: string; notes?: string; targetPrice?: number }
) {
  try {
    const user = await getOrCreateUser(uid, email);
    const cleanSymbol = input.symbol.toUpperCase().trim().slice(0, 24);
    const cleanNotes = (input.notes || '').trim().slice(0, 300);
    const safeTarget = Number.isFinite(Number(input.targetPrice)) ? Math.max(0, Number(input.targetPrice)) : 0;

    const inserted = await db
      .insert(watchlists)
      .values({
        userId: user.id,
        symbol: cleanSymbol,
        notes: cleanNotes,
        targetPrice: safeTarget,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database watchlist insert failed:', error);
    throw new Error('Failed to save watchlist item. Please try again later.', { cause: error });
  }
}

export async function removeUserWatchlistItem(uid: string, itemId: number) {
  try {
    const existingUser = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (existingUser.length === 0) return false;
    const deleted = await db
      .delete(watchlists)
      .where(and(eq(watchlists.id, itemId), eq(watchlists.userId, existingUser[0].id)))
      .returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('Database watchlist delete failed:', error);
    throw new Error('Failed to remove watchlist item. Please try again later.', { cause: error });
  }
}

export async function getUserScannerAlerts(uid: string) {
  try {
    return await db
      .select({
        id: scannerAlerts.id,
        symbol: scannerAlerts.symbol,
        strategy: scannerAlerts.strategy,
        triggerPrice: scannerAlerts.triggerPrice,
        status: scannerAlerts.status,
        createdAt: scannerAlerts.createdAt,
      })
      .from(scannerAlerts)
      .innerJoin(users, eq(scannerAlerts.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(scannerAlerts.createdAt));
  } catch (error) {
    console.error('Database alerts query failed:', error);
    throw new Error('Failed to load scanner alerts. Please try again later.', { cause: error });
  }
}
