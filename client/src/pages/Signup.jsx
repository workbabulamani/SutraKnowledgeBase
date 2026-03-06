import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Signup({ onSwitch }) {
    const { signup } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signup(email, name, password);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-logo"><img src="/logo2.svg" alt="Grnth Vault" style={{ height: 64, width: 'auto' }} /></div>
                <h1>Create account</h1>
                <p className="subtitle">Get started with Grnth Vault</p>
                {error && <div className="auth-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Name</label>
                        <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
                    </div>
                    <div className="form-group">
                        <label>Email</label>
                        <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} />
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={loading}>
                        {loading ? <span className="spinner" /> : 'Create Account'}
                    </button>
                </form>
                <div className="auth-link">
                    Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }}>Sign in</a>
                </div>
            </div>
        </div>
    );
}
