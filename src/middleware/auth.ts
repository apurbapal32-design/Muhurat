import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { MASTER_ADMIN_EMAIL } from '../utils/adminAuthSecurity.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireVerifiedAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  const isVerified = user.email_verified === true;
  if (!isVerified || email !== MASTER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden: Verified Administrator clearance required' });
  }
  next();
};
