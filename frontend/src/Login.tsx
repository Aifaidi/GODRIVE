import { useAuth } from 'react-oidc-context';
import { Lock, HardDrive, ShieldCheck } from 'lucide-react';

const Login = () => {
    const auth = useAuth();

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-[-20%] left-[-10%] w-[50vh] h-[50vh] bg-blue-500/10 rounded-full blur-3xl rounded-full mix-blend-screen animate-blob"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[50vh] h-[50vh] bg-purple-500/10 rounded-full blur-3xl mix-blend-screen animate-blob animation-delay-2000"></div>

            <div className="z-10 bg-slate-800/50 backdrop-blur-xl p-12 rounded-3xl border border-slate-700/50 shadow-2xl w-full max-w-md flex flex-col items-center text-center">
                <div className="bg-gradient-to-br from-blue-500 to-cyan-400 p-4 rounded-2xl shadow-lg shadow-blue-500/20 mb-8">
                    <HardDrive size={48} className="text-white" />
                </div>

                <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-2">
                    GoDrive
                </h1>
                <p className="text-slate-400 mb-8 text-lg">Secure & Simple Storage</p>

                <button
                    onClick={() => auth.signinRedirect()}
                    className="group relative w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
                >
                    <Lock size={20} className="group-hover:scale-110 transition-transform" />
                    <span>Sign In with SSO</span>
                    <div className="absolute inset-0 rounded-xl ring-2 ring-white/10 group-hover:ring-white/20 transition-all" />
                </button>

                <div className="mt-8 flex items-center gap-2 text-slate-500 text-sm font-medium">
                    <ShieldCheck size={16} />
                    <span>Private & Encrypted access</span>
                </div>
            </div>

            <div className="absolute bottom-8 text-slate-600 text-sm">
                &copy; 2024 GoDrive Enterprise
            </div>
        </div>
    );
};

export default Login;
