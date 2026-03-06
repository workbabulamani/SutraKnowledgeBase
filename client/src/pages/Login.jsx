import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login({ onSwitch }) {
    const { login, pending2FA, verify2FA, cancel2FA } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [totpCode, setTotpCode] = useState('');
    const totpInputRef = useRef(null);

    // Auto-focus TOTP input when 2FA screen appears
    useEffect(() => {
        if (pending2FA && totpInputRef.current) {
            totpInputRef.current.focus();
        }
    }, [pending2FA]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handle2FASubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await verify2FA(totpCode);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Show 2FA code entry
    if (pending2FA) {
        return (
            <div className="auth-page">
                <div className="auth-card">
                    <div className="auth-logo"><img src="/logo2.svg" alt="Grnth Vault" style={{ height: 64, width: 'auto' }} /></div>
                    <h1>Two-Factor Auth</h1>
                    <p className="auth-subtitle">Enter the 6-digit code from your authenticator app</p>
                    {error && <div className="auth-error">{error}</div>}
                    <form onSubmit={handle2FASubmit}>
                        <div className="form-group">
                            <label>Verification Code</label>
                            <input
                                ref={totpInputRef}
                                className="input"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                value={totpCode}
                                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000"
                                autoFocus
                                required
                                style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontWeight: 600 }}
                            />
                        </div>
                        <button className="btn btn-primary" type="submit" disabled={loading || totpCode.length !== 6} style={{ width: '100%' }}>
                            {loading ? <span className="spinner" /> : 'Verify'}
                        </button>
                    </form>
                    <div className="auth-footer">
                        <a href="#" onClick={(e) => { e.preventDefault(); cancel2FA(); setTotpCode(''); setError(''); }}>← Back to login</a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-logo"><img src="/logo2.svg" alt="Grnth Vault" style={{ height: 64, width: 'auto' }} /></div>
                <h1>Welcome back</h1>
                <p className="auth-subtitle">Sign in to Grnth Vault</p>
                {error && <div className="auth-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Email</label>
                        <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@admin.com" required />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
                        {loading ? <span className="spinner" /> : 'Sign In'}
                    </button>
                </form>
                {onSwitch && (
                    <div className="auth-footer">
                        Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }}>Sign up</a>
                    </div>
                )}
            </div>
        </div>
    );
}
