import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { resolveUserAccessFromFirestore } from '../lib/adminAccessService';
import {
  AccessRequestRecord,
  AccessResolutionState,
  AuthorizedUserRecord,
} from '../utils/adminAuthSecurity';

export interface ServerSessionInfo {
  verified: boolean;
  uid?: string;
  email?: string;
  emailVerified?: boolean;
  isMasterAdmin?: boolean;
}

interface AuthAccessContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  isBusy: boolean;
  accessState: AccessResolutionState;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  canAccessTerminal: boolean;
  authorizedUser: AuthorizedUserRecord | null;
  accessRequest: AccessRequestRecord | null;
  serverSession: ServerSessionInfo | null;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthAccessContext = createContext<AuthAccessContextValue | null>(null);

export const AuthAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [accessState, setAccessState] = useState<AccessResolutionState>('UNAUTHENTICATED');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState<boolean>(false);
  const [canAccessTerminal, setCanAccessTerminal] = useState<boolean>(false);
  const [authorizedUser, setAuthorizedUser] = useState<AuthorizedUserRecord | null>(null);
  const [accessRequest, setAccessRequest] = useState<AccessRequestRecord | null>(null);
  const [serverSession, setServerSession] = useState<ServerSessionInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncUserAccess = useCallback(async (user: User | null) => {
    if (!user) {
      setAccessState('UNAUTHENTICATED');
      setIsAdmin(false);
      setIsMasterAdmin(false);
      setCanAccessTerminal(false);
      setAuthorizedUser(null);
      setAccessRequest(null);
      setServerSession(null);
      return;
    }

    try {
      const resolved = await resolveUserAccessFromFirestore(user);
      setAccessState(resolved.state);
      setIsAdmin(resolved.isAdmin);
      setIsMasterAdmin(resolved.isMasterAdmin);
      setCanAccessTerminal(resolved.canAccessTerminal);
      setAuthorizedUser(resolved.authorizedUser);
      setAccessRequest(resolved.accessRequest);

      // Defense-in-depth server-side Bearer ID token verification
      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setServerSession({
            verified: true,
            uid: data.uid,
            email: data.email,
            emailVerified: data.emailVerified,
            isMasterAdmin: data.isMasterAdmin,
          });
        } else {
          setServerSession({ verified: false });
        }
      } catch {
        setServerSession(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify account permissions.';
      setAuthError(message);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      await syncUserAccess(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, [syncUserAccess]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setIsBusy(true);
    try {
      googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, googleAuthProvider);
      setFirebaseUser(result.user);
      await syncUserAccess(result.user);
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Sign-in popup was closed before completing authentication.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Browser blocked the sign-in popup. Please allow popups for this site and try again.');
      } else {
        setAuthError(error?.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setIsBusy(false);
    }
  }, [syncUserAccess]);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    setIsBusy(true);
    try {
      await signOut(auth);
      setFirebaseUser(null);
      await syncUserAccess(null);
    } catch (error: any) {
      setAuthError(error?.message || 'Failed to sign out cleanly.');
    } finally {
      setIsBusy(false);
    }
  }, [syncUserAccess]);

  const refreshAccess = useCallback(async () => {
    if (!auth.currentUser) return;
    setIsBusy(true);
    try {
      await syncUserAccess(auth.currentUser);
    } finally {
      setIsBusy(false);
    }
  }, [syncUserAccess]);

  return (
    <AuthAccessContext.Provider
      value={{
        firebaseUser,
        authReady,
        isBusy,
        accessState,
        isAdmin,
        isMasterAdmin,
        canAccessTerminal,
        authorizedUser,
        accessRequest,
        serverSession,
        authError,
        signInWithGoogle,
        signOutUser,
        refreshAccess,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthAccessContext.Provider>
  );
};

export function useAuthAccess(): AuthAccessContextValue {
  const ctx = useContext(AuthAccessContext);
  if (!ctx) {
    throw new Error('useAuthAccess must be used within AuthAccessProvider');
  }
  return ctx;
}
