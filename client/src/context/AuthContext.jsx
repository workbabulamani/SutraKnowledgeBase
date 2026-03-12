import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const stored = localStorage.getItem('md_viewer_user');
        return stored ? JSON.parse(stored) : null;
    });
    const [loading, setLoading] = useState(true);
    const [pending2FA, setPending2FA] = useState(null); // { tempToken, email }
    const [inactivityWarning, setInactivityWarning] = useState(false);
    const lastActivityRef = useRef(Date.now());
    const sessionTimeoutRef = useRef(30); // default 30 minutes
    const warningShownRef = useRef(false);

    useEffect(() => {
        const token = localStorage.getItem('md_viewer_token');
        if (token) {
            api.me().then(data => {
                setUser(data.user);
                localStorage.setItem('md_viewer_user', JSON.stringify(data.user));
            }).catch(() => {
                setUser(null);
                localStorage.removeItem('md_viewer_token');
                localStorage.removeItem('md_viewer_user');
            }).finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    // Load session timeout from server
    useEffect(() => {
        api.getSessionInfo().then(data => {
            if (data.sessionTimeout) {
                sessionTimeoutRef.current = data.sessionTimeout;
            }
        }).catch(() => { /* use default */ });
    }, []);

    // Track user activity — any interaction resets the timer
    useEffect(() => {
        const updateActivity = () => {
            lastActivityRef.current = Date.now();
            // Clear warning when user becomes active
            if (warningShownRef.current) {
                warningShownRef.current = false;
                setInactivityWarning(false);
            }
        };
        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));
        return () => events.forEach(e => window.removeEventListener(e, updateActivity));
    }, []);

    // Token refresh — refresh JWT when user is active (every 5 minutes)
    useEffect(() => {
        const refreshInterval = setInterval(async () => {
            const token = localStorage.getItem('md_viewer_token');
            if (!token) return;

            // Only refresh if user has been active recently (within last 5 min)
            const inactiveMs = Date.now() - lastActivityRef.current;
            if (inactiveMs < 5 * 60 * 1000) {
                try {
                    const data = await api.refreshToken();
                    if (data.token) {
                        localStorage.setItem('md_viewer_token', data.token);
                        if (data.user) {
                            localStorage.setItem('md_viewer_user', JSON.stringify(data.user));
                            setUser(data.user);
                        }
                    }
                } catch (e) {
                    // Token might be expired already — will be caught by inactivity check
                }
            }
        }, 5 * 60 * 1000); // every 5 minutes

        return () => clearInterval(refreshInterval);
    }, []);

    // Check inactivity every 15 seconds — show warning 2 min before, logout on timeout
    useEffect(() => {
        const check = () => {
            const token = localStorage.getItem('md_viewer_token');
            if (!token) return;

            // Check token expiry
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp * 1000 < Date.now()) {
                    setUser(null);
                    localStorage.removeItem('md_viewer_token');
                    localStorage.removeItem('md_viewer_user');
                    window.location.href = '/';
                    return;
                }
            } catch (e) { /* invalid token format */ }

            // Check inactivity
            const inactiveMs = Date.now() - lastActivityRef.current;
            const timeoutMs = sessionTimeoutRef.current * 60 * 1000;
            const warningMs = timeoutMs - 2 * 60 * 1000; // 2 min before timeout

            if (inactiveMs > timeoutMs) {
                setUser(null);
                localStorage.removeItem('md_viewer_token');
                localStorage.removeItem('md_viewer_user');
                window.location.href = '/';
            } else if (inactiveMs > warningMs && warningMs > 0 && !warningShownRef.current) {
                warningShownRef.current = true;
                setInactivityWarning(true);
            }
        };
        const interval = setInterval(check, 15000);
        return () => clearInterval(interval);
    }, []);

    const login = useCallback(async (email, password) => {
        const data = await api.login(email, password);
        if (data.requires2FA) {
            setPending2FA({ tempToken: data.tempToken, email });
            return data;
        }
        localStorage.setItem('md_viewer_token', data.token);
        localStorage.setItem('md_viewer_user', JSON.stringify(data.user));
        setUser(data.user);
        lastActivityRef.current = Date.now();
        return data;
    }, []);

    const verify2FA = useCallback(async (code) => {
        if (!pending2FA) throw new Error('No pending 2FA');
        const data = await api.totpVerifyLogin(pending2FA.tempToken, code);
        localStorage.setItem('md_viewer_token', data.token);
        localStorage.setItem('md_viewer_user', JSON.stringify(data.user));
        setUser(data.user);
        setPending2FA(null);
        lastActivityRef.current = Date.now();
        return data;
    }, [pending2FA]);

    const cancel2FA = useCallback(() => {
        setPending2FA(null);
    }, []);

    const signup = useCallback(async (email, name, password) => {
        const data = await api.signup(email, name, password);
        localStorage.setItem('md_viewer_token', data.token);
        localStorage.setItem('md_viewer_user', JSON.stringify(data.user));
        setUser(data.user);
        lastActivityRef.current = Date.now();
        return data;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('md_viewer_token');
        localStorage.removeItem('md_viewer_user');
        setUser(null);
    }, []);

    const updateUser = useCallback((userData) => {
        setUser(userData);
        localStorage.setItem('md_viewer_user', JSON.stringify(userData));
    }, []);

    return (
        <AuthContext.Provider value={{
            user, login, signup, logout, loading, isAuthenticated: !!user,
            pending2FA, verify2FA, cancel2FA, inactivityWarning, setInactivityWarning, updateUser
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
