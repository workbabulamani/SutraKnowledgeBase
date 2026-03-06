import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { api } from './api/client.js';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Layout from './components/Layout.jsx';

function AppInner() {
    const { isAuthenticated, loading } = useAuth();
    const [showSignup, setShowSignup] = useState(false);
    const [allowSignup, setAllowSignup] = useState(false);

    useEffect(() => {
        api.getConfig().then(c => setAllowSignup(c.allowSignup)).catch(() => { });
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg-secondary)' }}>
                <span className="spinner" style={{ width: 28, height: 28 }} />
            </div>
        );
    }

    if (!isAuthenticated) {
        if (showSignup && allowSignup) {
            return <Signup onSwitch={() => setShowSignup(false)} />;
        }
        return <Login onSwitch={allowSignup ? () => setShowSignup(true) : null} />;
    }

    return (
        <AppProvider>
            <Layout />
        </AppProvider>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppInner />
            </AuthProvider>
        </ThemeProvider>
    );
}
