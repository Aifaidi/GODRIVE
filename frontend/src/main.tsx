import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider, AuthProviderProps } from 'react-oidc-context'
import { loadOidcConfig } from './authConfig'

class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-screen bg-red-50 text-red-900 p-8">
                    <h1 className="text-3xl font-bold mb-4">Something went wrong</h1>
                    <pre className="bg-white p-4 rounded shadow border border-red-200 text-sm overflow-auto max-w-2xl w-full">
                        {this.state.error?.toString()}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-6 px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

const Root = () => {
    const [authConfig, setAuthConfig] = useState<AuthProviderProps | null>(null);
    const [loading, setLoading] = useState(true);
    const [configError, setConfigError] = useState<string | null>(null);

    useEffect(() => {
        loadOidcConfig()
            .then(config => {
                if (!config) {
                    setConfigError("Failed to load OIDC configuration (returned null)");
                } else {
                    setAuthConfig(config);
                }
            })
            .catch(err => {
                setConfigError("Error loading OIDC config: " + err.toString());
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-slate-900 text-white font-mono">Initializing Application...</div>;
    }

    if (configError || !authConfig) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-red-500 p-4 text-center">
                <h2 className="text-xl font-bold mb-2">Configuration Error</h2>
                <p>{configError || "Unknown configuration error"}</p>
            </div>
        );
    }

    return (
        <React.StrictMode>
            <GlobalErrorBoundary>
                <AuthProvider {...authConfig}>
                    <GlobalErrorBoundary>
                        <App />
                    </GlobalErrorBoundary>
                </AuthProvider>
            </GlobalErrorBoundary>
        </React.StrictMode>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
