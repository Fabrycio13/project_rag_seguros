"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Lock, Mail, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import MagicRings from '@/components/MagicRings';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    console.log("🚀 Tentando login para:", email);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("❌ Erro no login:", error.message);
        throw error;
      }

      console.log("✅ Login bem-sucedido!", data);
      window.location.href = "/";
    } catch (err: any) {
      console.error("💥 Falha crítica no login:", err);
      alert("ERRO NO LOGIN: " + (err.message || JSON.stringify(err)));
      setError(err.message || "Erro ao fazer login. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 overflow-hidden relative">
      {/* Background Effect - Full Screen */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        <MagicRings
          color="#A855F7"
          colorTwo="#6366F1"
          ringCount={isMobile ? 8 : 6}
          speed={0.8}
          attenuation={isMobile ? 8 : 6}
          lineThickness={isMobile ? 1.5 : 2}
          baseRadius={isMobile ? 0.2 : 0.35}
          radiusStep={isMobile ? 0.15 : 0.1}
          scaleRate={0.12}
          opacity={1}
          blur={0}
          noiseAmount={0.1}
          rotation={isMobile ? 90 : 25}
          ringGap={isMobile ? 2.5 : 1.5}
          fadeIn={0.7}
          fadeOut={0.5}
          followMouse={!isMobile}
          mouseInfluence={0.2}
          hoverScale={1.2}
          parallax={0.05}
          clickBurst={false}
        />
      </div>

      <div className="w-full max-w-md z-10 relative" style={{ zIndex: 1 }}>
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="mb-4">
            <img 
              src="data:image/png;base64,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" 
              alt="Usabit Logo" 
              className="h-10 w-auto object-contain"
            />
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs py-3 px-4 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Entrar no Painel"
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-zinc-600 text-xs">
          Usabit & SecuraVida Seguros &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
