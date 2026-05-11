"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { 
  UploadCloud, 
  FileText, 
  MessageSquare, 
  LayoutDashboard,
  Settings,
  User,
  Plus,
  Send,
  Bot,
  Menu,
  Info,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Power,
  AlertTriangle,
  X,
  LogOut
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Tab = "dashboard" | "documents";

interface Document {
  id: string;
  name: string;
  status: "Processado" | "Processando" | "Recusado";
  added: string;
  size: string;
  errorMessage?: string;
  source_uri?: string;
  is_active?: boolean;
  description?: string;
}

interface Message {
  id: string;
  role: "system" | "user" | "ai";
  content: string | React.ReactNode;
}

// Simple markdown formatter for bold text and line breaks
const formatMessage = (text: string | React.ReactNode) => {
  if (typeof text !== "string") return text;
  
  // Replace **text** or *text* with <strong>text</strong>
  const formatted = text.replace(/[*]{1,2}([^*]+)[*]{1,2}/g, "<strong>$1</strong>");
  
  return (
    <div 
      dangerouslySetInnerHTML={{ __html: formatted }} 
      className="whitespace-pre-wrap"
    />
  );
};

export default function AppLayout() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("documents");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadDescription, setUploadDescription] = useState("");
  
  // Resizable Split View State
  const [leftWidth, setLeftWidth] = useState(70);
  const containerRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const handleMouseMove = (mouseEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((mouseEvent.clientX - containerRect.left) / containerRect.width) * 100;
      if (newWidth >= 30 && newWidth <= 70) {
        setLeftWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  }, []);
  
  // Custom Modal States
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    confirmText: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "danger",
    confirmText: "Confirmar",
    onConfirm: () => {}
  });

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "system",
      content: "Olá! Estou pronto para responder perguntas sobre sua base de conhecimento."
    }
  ]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) {
        throw new Error(`Servidor retornou erro: ${res.status}`);
      }
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);

      if (data.documents) {
        const mapped = data.documents.map((d: any) => ({
          id: d.id,
          name: d.title,
          status: d.status === "completed" ? "Processado" : d.status === "processing" ? "Processando" : "Recusado",
          added: new Date(d.created_at).toLocaleDateString("pt-BR"),
          size: d.metadata?.size ? `${(d.metadata.size / 1024 / 1024).toFixed(1)} MB` : "-",
          errorMessage: d.metadata?.error || undefined,
          source_uri: d.source_uri,
          is_active: d.metadata?.is_active !== false,
          description: d.metadata?.description || undefined,
        }));
        setDocuments(mapped);
      }
    } catch (err: any) {
      console.error("Failed to load documents", err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUploadClick = () => {
    setIsUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setSelectedFiles([]);
    setUploadDescription("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (selectedFiles.length + files.length > 10) {
        alert("Você pode enviar no máximo 10 arquivos por vez.");
        return;
      }
      setSelectedFiles(prev => [...prev, ...files].slice(0, 10));
    }
    // reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    const filesToUpload = [...selectedFiles];
    const desc = uploadDescription.trim();
    
    // Close modal right away so user sees the table updating
    setIsUploadModalOpen(false);
    setSelectedFiles([]);
    setUploadDescription("");

    const tempIds = filesToUpload.map(() => crypto.randomUUID());
    const tempDocs = filesToUpload.map((file, idx) => ({
      id: tempIds[idx],
      name: file.name,
      status: "Processando" as const,
      added: new Date().toLocaleDateString("pt-BR"),
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      is_active: true,
      description: desc || undefined
    }));

    setDocuments(prev => [...tempDocs, ...prev]);

    // Upload sequentially to avoid overloading the API / memory
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const formData = new FormData();
      formData.append("file", file);
      if (desc) {
        formData.append("description", desc);
      }

      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Resposta inválida do servidor`);
        }
        
        if (data.error) {
          console.error(`Erro no upload de ${file.name}:`, data.error);
        }
      } catch (error: any) {
        console.error("Error uploading file", error);
      }
      // Refresh after EACH file to update table status incrementally
      await fetchDocuments();
    }
    
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteDocument = (id: string, name: string) => {
    setModalConfig({
      isOpen: true,
      title: "Excluir Documento",
      message: `Tem certeza que deseja excluir o documento "${name}" e todos os seus dados do RAG? Esta ação não pode ser desfeita.`,
      type: "danger",
      confirmText: "Excluir",
      onConfirm: async () => {
        closeModal();
        try {
          setDocuments(prev => prev.filter(doc => doc.id !== id));
          const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `Status ${res.status}`);
        } catch (err: any) {
          console.error("Erro ao deletar documento", err);
          alert("Erro ao excluir documento: " + err.message);
          fetchDocuments();
        }
      }
    });
  };

  const handleDeleteAll = () => {
    setModalConfig({
      isOpen: true,
      title: "Excluir Toda a Base",
      message: "ATENÇÃO: Você tem certeza que deseja EXCLUIR TODOS os documentos da base de dados? Isso apagará toda a memória da IA permanentemente.",
      type: "danger",
      confirmText: "Sim, Excluir Tudo",
      onConfirm: async () => {
        closeModal();
        try {
          setDocuments([]);
          const res = await fetch(`/api/documents/all`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `Status ${res.status}`);
        } catch (err: any) {
          alert("Erro ao excluir tudo: " + err.message);
          fetchDocuments();
        }
      }
    });
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, is_active: !currentStatus } : doc));
      const res = await fetch(`/api/documents/${id}/toggle`, { method: "POST", body: JSON.stringify({ is_active: !currentStatus }) });
      if (!res.ok) throw new Error("Erro ao alterar status.");
    } catch (err: any) {
      alert(err.message);
      fetchDocuments();
    }
  };

  const handleReprocess = (id: string) => {
    setModalConfig({
      isOpen: true,
      title: "Reprocessar Documento",
      message: "Deseja reprocessar este documento? O arquivo será relido e indexado novamente no banco vetorial.",
      type: "info",
      confirmText: "Reprocessar",
      onConfirm: async () => {
        closeModal();
        try {
          setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, status: "Processando" } : doc));
          const res = await fetch(`/api/documents/${id}/reprocess`, { method: "POST" });
          if (!res.ok) throw new Error("Erro ao reprocessar.");
          fetchDocuments();
        } catch (err: any) {
          alert(err.message);
          fetchDocuments();
        }
      }
    });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const query = chatInput;
    const newMsg: Message = { id: crypto.randomUUID(), role: "user", content: query };
    setMessages(prev => [...prev, newMsg]);
    setChatInput("");

    try {
      // Pass the query AND the history of previous messages (omitting the first system greeting)
      const chatHistory = messages.slice(1).map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : ""
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, history: chatHistory }),
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Servidor não retornou JSON. Status: ${res.status}`);
      }

      if (data.error) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: `Erro: ${data.error}` }]);
        return;
      }

      setMessages(prev => [
        ...prev, 
        { 
          id: crypto.randomUUID(), 
          role: "ai", 
          content: data.answer 
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: `Erro ao conectar: ${err.message}` }]);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.href = "/login";
    } catch (err: any) {
      console.error("Erro ao sair:", err);
      alert("Erro ao sair: " + err.message);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden selection:bg-blue-500/30">
      
      {/* SIDEBAR */}
      <aside className={`border-r border-zinc-800/60 bg-zinc-950 flex flex-col transition-all duration-300 ${isSidebarOpen ? "w-64" : "w-20"}`}>
        {/* Logo & Toggle */}
        <div className="p-5 border-b border-zinc-800/60 flex items-center justify-between">
          {isSidebarOpen && (
            <div className="flex-1 overflow-hidden mr-2 flex items-center">
              <img 
                src="/logo_usabit_email.png" 
                alt="Usabit Logo" 
                className="h-8 w-auto object-contain"
              />
            </div>
          )}
          
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors shrink-0 ${!isSidebarOpen && "mx-auto"}`}
            title={isSidebarOpen ? "Recolher menu" : "Expandir menu"}
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Navigation */}
        <div className={`flex-1 overflow-y-auto py-6 ${isSidebarOpen ? "px-4" : "px-3"}`}>
          {isSidebarOpen && <div className="text-[11px] font-semibold text-zinc-500 tracking-wider mb-4 px-2">ESPAÇO DE TRABALHO</div>}
          <nav className="space-y-1.5">
            <button 
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start px-3 gap-3" : "justify-center px-0"} py-2.5 text-sm font-medium transition-all rounded-lg ${
                activeTab === "dashboard" 
                ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" 
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80"
              }`}
              title={!isSidebarOpen ? "Dashboard" : undefined}
            >
              <LayoutDashboard size={18} className="shrink-0" />
              {isSidebarOpen && <span>Dashboard</span>}
            </button>
            <button 
              onClick={() => setActiveTab("documents")}
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start px-3 gap-3" : "justify-center px-0"} py-2.5 text-sm font-medium transition-all rounded-lg ${
                activeTab === "documents" 
                ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" 
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80"
              }`}
              title={!isSidebarOpen ? "Documentos" : undefined}
            >
              <FileText size={18} className="shrink-0" />
              {isSidebarOpen && <span>Documentos</span>}
            </button>
          </nav>
        </div>

        <div className={`p-4 border-t border-zinc-800/60 flex flex-col gap-1 ${!isSidebarOpen && "items-center"}`}>
          {/* User Profile */}
          {isSidebarOpen ? (
            <div className="flex items-center gap-3 p-2.5 mb-2 bg-zinc-900/50 hover:bg-zinc-900 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-zinc-800/80 w-full overflow-hidden">
              <div className="w-9 h-9 bg-zinc-800 flex items-center justify-center rounded-full shadow-sm shrink-0">
                <User size={18} className="text-zinc-400" />
              </div>
              <div className="flex-1 truncate">
                <div className="text-sm font-medium truncate">Usabit</div>
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 mb-2 bg-zinc-800 flex items-center justify-center rounded-full shadow-sm shrink-0 cursor-pointer hover:bg-zinc-700 transition-colors" title="Usabit">
              <User size={18} className="text-zinc-400" />
            </div>
          )}

          <button 
            className={`flex items-center ${isSidebarOpen ? "justify-start gap-3 px-3" : "justify-center"} text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors w-full py-2.5 rounded-lg hover:bg-zinc-900/80`}
            title={!isSidebarOpen ? "Configurações" : undefined}
          >
            <Settings size={18} className="shrink-0" />
            {isSidebarOpen && <span>Configurações</span>}
          </button>
          <button 
            onClick={handleLogout}
            className={`flex items-center ${isSidebarOpen ? "justify-start gap-3 px-3" : "justify-center"} text-sm font-medium text-red-400/80 hover:text-red-400 transition-colors w-full py-2.5 rounded-lg hover:bg-red-500/10 mt-1`}
            title={!isSidebarOpen ? "Sair" : undefined}
          >
            <LogOut size={18} className="shrink-0" />
            {isSidebarOpen && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden bg-zinc-950">
        {activeTab === "dashboard" ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center bg-zinc-900/30 p-12 rounded-3xl border border-zinc-800/50">
              <LayoutDashboard size={48} className="mx-auto mb-4 opacity-30 text-blue-400" />
              <h2 className="text-xl font-medium mb-2 text-zinc-300">Dashboard Vazio</h2>
              <p className="text-sm">Esta área está reservada para o futuro dashboard.</p>
            </div>
          </div>
        ) : (
          /* DOCUMENTS SPLIT VIEW */
          <div className="flex-1 flex" ref={containerRef}>
            
            {/* LEFT PANE: UPLOAD & LIST */}
            <div style={{ width: `${leftWidth}%` }} className="min-w-[400px] flex flex-col bg-zinc-950">
              <div className="p-8 pb-4">
                <h1 className="text-xl font-semibold mb-6">Upload Knowledge</h1>
                
                {/* Empty State / Upload trigger placeholder */}
                <div 
                  onClick={handleUploadClick}
                  className="border-2 border-dashed border-zinc-700/60 bg-zinc-900/30 hover:bg-zinc-900 hover:border-blue-500/50 transition-all duration-300 cursor-pointer p-10 flex flex-col items-center justify-center text-center group rounded-2xl relative overflow-hidden"
                >
                  <div className="w-14 h-14 bg-zinc-800 text-zinc-400 group-hover:text-blue-400 group-hover:bg-blue-500/10 transition-colors duration-300 flex items-center justify-center rounded-full mb-5 shadow-sm">
                    <UploadCloud size={26} />
                  </div>
                  <div className="font-medium text-sm mb-2 text-zinc-200">Clique para adicionar documentos</div>
                  <div className="text-[13px] text-zinc-500">Ou use o botão "Adicionar Novo" abaixo</div>
                </div>
              </div>

              <div className="flex-1 flex flex-col p-8 pt-4">
                <div className="flex items-center justify-between mb-6">
                  <div className="text-sm font-medium text-zinc-500 flex items-center gap-2">
                    Início <span className="text-zinc-700">&gt;</span> <span className="text-zinc-100">Base de Conhecimento</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={handleDeleteAll} className="flex items-center gap-2 bg-zinc-900 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 border border-zinc-800 hover:border-red-500/30 text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-sm">
                      <Trash2 size={16} />
                      Excluir Tudo
                    </button>
                    <button onClick={handleUploadClick} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-sm shadow-blue-900/20">
                      <Plus size={16} />
                      Adicionar Novo
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/60">
                      <tr>
                        <th className="pb-4">Nome do Arquivo</th>
                        <th className="pb-4 w-28 text-center">Status</th>
                        <th className="pb-4 w-28 text-center">Data</th>
                        <th className="pb-4 w-24 text-center">Tamanho</th>
                        <th className="pb-4 w-40 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {documents.map(doc => (
                        <tr key={doc.id} className={`hover:bg-zinc-900/40 transition-colors group ${!doc.is_active ? "opacity-50 grayscale" : ""}`}>
                          <td className="py-4 w-2/5">
                            <div className="flex items-center gap-3 pr-4">
                              <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors ${doc.is_active ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20' : 'bg-zinc-800 text-zinc-500'}`}>
                                <FileText size={16} />
                              </div>
                              <span className={`font-medium break-words ${!doc.is_active ? 'text-zinc-500 line-through' : 'text-zinc-200'}`} title={doc.name}>{doc.name}</span>
                            </div>
                          </td>
                          <td className="py-4 text-center">
                            {doc.status === "Processado" ? (
                              <span className="inline-flex items-center gap-1.5 border border-green-500/20 bg-green-500/10 text-green-400 text-[11px] font-bold px-2.5 py-1 rounded-full">
                                Processado
                              </span>
                            ) : doc.status === "Processando" ? (
                              <span className="inline-flex items-center gap-1.5 border border-yellow-500/20 bg-yellow-500/10 text-yellow-400 text-[11px] font-bold px-2.5 py-1 rounded-full animate-pulse">
                                Processando
                              </span>
                            ) : (
                              <div className="relative flex items-center justify-center group/tooltip cursor-help">
                                <span className="inline-flex items-center gap-1.5 border border-red-500/20 bg-red-500/10 text-red-400 text-[11px] font-bold px-2.5 py-1 rounded-full">
                                  Recusado
                                  <Info size={12} className="text-red-400/70" />
                                </span>
                                
                                {/* Custom Premium Tooltip */}
                                {doc.errorMessage && (
                                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover/tooltip:block w-56 bg-zinc-800 text-zinc-200 text-xs p-3 rounded-lg shadow-xl border border-zinc-700/80 z-50 normal-case font-normal pointer-events-none text-left">
                                    <div className="font-semibold text-red-400 mb-1">Erro de Processamento</div>
                                    {doc.errorMessage}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-px border-4 border-transparent border-b-zinc-700/80"></div>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 border-4 border-transparent border-b-zinc-800"></div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-4 text-zinc-400 text-center">{doc.added}</td>
                          <td className="py-4 text-zinc-400 text-center">
                            <span className="text-zinc-500 text-xs">{doc.size}</span>
                          </td>
                          <td className="py-4 text-zinc-400 text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              
                              {/* Description Note Tooltip */}
                              {doc.description && (
                                <div className="relative group/note cursor-help flex items-center justify-center">
                                  <div className="p-2 text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors">
                                    <MessageSquare size={16} />
                                  </div>
                                  <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/note:block w-56 bg-zinc-800 text-zinc-200 text-xs p-3 rounded-lg shadow-xl border border-zinc-700/80 z-50 normal-case font-normal pointer-events-none text-left">
                                    <div className="font-semibold text-purple-400 mb-1">Nota</div>
                                    {doc.description}
                                    <div className="absolute left-full top-1/2 -translate-y-1/2 -ml-px border-4 border-transparent border-l-zinc-700/80"></div>
                                    <div className="absolute left-full top-1/2 -translate-y-1/2 -ml-1 border-4 border-transparent border-l-zinc-800"></div>
                                  </div>
                                </div>
                              )}

                              {/* Open Document */}
                              {doc.source_uri && (
                                <a
                                  href={`https://lmoxcjndvhnxihtvnavs.supabase.co/storage/v1/object/public/documents/${doc.source_uri}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                  title="Ver Arquivo Original"
                                >
                                  <Eye size={16} />
                                </a>
                              )}

                              {/* Toggle Active */}
                              {doc.status === "Processado" && (
                                <button
                                  onClick={() => handleToggleActive(doc.id, !!doc.is_active)}
                                  className={`p-2 rounded-lg transition-colors ${doc.is_active ? 'text-zinc-500 hover:text-yellow-400 hover:bg-yellow-500/10' : 'text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10'}`}
                                  title={doc.is_active ? "Desativar na IA" : "Ativar na IA"}
                                >
                                  <Power size={16} />
                                </button>
                              )}

                              {/* Reprocess */}
                              {(doc.status === "Recusado" || doc.status === "Processado") && (
                                <button
                                  onClick={() => handleReprocess(doc.id)}
                                  className="p-2 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                  title="Reprocessar Embeddings"
                                >
                                  <RefreshCw size={16} />
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                onClick={() => handleDeleteDocument(doc.id, doc.name)}
                                className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Excluir documento"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RESIZABLE DIVIDER */}
            <div 
              onMouseDown={startResizing}
              className="w-1 bg-zinc-800/60 hover:bg-blue-500/80 active:bg-blue-500 cursor-col-resize transition-colors z-10 shrink-0"
              title="Arraste para redimensionar"
            />

            {/* RIGHT PANE: AI CHAT */}
            <div style={{ width: `${100 - leftWidth}%` }} className="flex flex-col bg-zinc-900/20">
              {/* Chat Header */}
              <div className="h-[76px] border-b border-zinc-800/60 px-8 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-600/10 text-blue-500 flex items-center justify-center rounded-full shadow-sm border border-blue-500/20">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">Assistente de IA</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                      <span className="text-[11px] text-green-400 font-medium tracking-wide">RAG Ativo</span>
                    </div>
                  </div>
                </div>
                <button className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors border border-zinc-800">
                  <Plus size={18} />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {messages.map((msg, idx) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "user" ? (
                      <div className="flex items-end gap-3 max-w-[80%]">
                        <div className="bg-blue-600 text-white px-5 py-3.5 text-sm leading-relaxed shadow-md rounded-2xl rounded-br-sm whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        <div className="w-8 h-8 bg-zinc-800 flex items-center justify-center shrink-0 rounded-full border border-zinc-700/50 mb-1">
                          <User size={14} className="text-zinc-300" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-end gap-3 max-w-[85%]">
                        <div className="w-8 h-8 bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0 mb-1 rounded-full">
                          <Bot size={16} className="text-blue-400" />
                        </div>
                        <div className="bg-zinc-800/80 border border-zinc-700/50 px-5 py-4 text-sm leading-relaxed text-zinc-200 shadow-sm rounded-2xl rounded-bl-sm">
                          {formatMessage(msg.content)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              <div className="p-6 bg-zinc-950 border-t border-zinc-800/60">
                <form 
                  onSubmit={handleSendMessage}
                  className="relative flex items-center max-w-4xl mx-auto"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Faça uma pergunta sobre seus documentos..."
                    className="w-full bg-zinc-900 border border-zinc-700/60 text-sm text-zinc-100 placeholder-zinc-500 py-4 pl-5 pr-14 focus:outline-none focus:border-blue-500 focus:bg-zinc-900 focus:ring-1 focus:ring-blue-500/50 transition-all rounded-full shadow-inner"
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="absolute right-2 p-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white disabled:text-zinc-500 rounded-full transition-all flex items-center justify-center shadow-sm"
                  >
                    <Send size={16} className="ml-0.5" />
                  </button>
                </form>
                <div className="text-center mt-4">
                  <span className="text-[11px] text-zinc-500 font-medium tracking-wide">A IA pode cometer erros. Verifique informações importantes.</span>
                </div>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* UPLOAD MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 text-zinc-100 border border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 pb-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-zinc-100">Upload de Documentos</h3>
                <button onClick={closeUploadModal} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mt-1 -mr-1">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-zinc-400">
                Adicione documentos à base de conhecimento. O título será extraído do nome do arquivo e a categoria será "Outros".
              </p>
            </div>

            <div className="p-6 pt-2 space-y-6">
              {/* File Dropzone area */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-2">Arquivos * (Máx. 10)</label>
                {selectedFiles.length === 0 ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-700 bg-zinc-950/50 hover:bg-zinc-800/80 hover:border-blue-500/50 transition-all cursor-pointer p-8 flex flex-col items-center justify-center text-center rounded-xl group"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".pdf,.txt,.md,.docx"
                      multiple
                    />
                    <UploadCloud size={28} className="text-zinc-500 mb-4 group-hover:text-blue-400 transition-colors" />
                    <div className="text-sm text-zinc-400 mb-4 group-hover:text-zinc-300 transition-colors">Arraste e solte até 10 arquivos aqui ou clique para selecionar</div>
                    <button className="px-4 py-2 border border-zinc-700 bg-zinc-900 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors shadow-sm">
                      Selecionar Arquivos
                    </button>
                  </div>
                ) : (
                  <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-zinc-400">{selectedFiles.length} arquivo(s) selecionado(s)</div>
                      {selectedFiles.length < 10 && (
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                        >
                          + Adicionar mais
                        </button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm bg-zinc-900 p-2.5 rounded-lg border border-zinc-800/60">
                          <div className="flex items-center gap-2 overflow-hidden pr-2">
                            <FileText size={16} className="text-blue-400 shrink-0" />
                            <span className="truncate text-zinc-200 font-medium">{file.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-2">
                            <span className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                            <button onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))} className="text-zinc-500 hover:text-red-400 bg-zinc-950 hover:bg-red-500/10 p-1.5 rounded-md transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Hidden input to allow adding more */}
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".pdf,.txt,.md,.docx"
                      multiple
                    />
                  </div>
                )}
                <div className="text-[13px] text-zinc-500 mt-2">Formatos aceitos: PDF, DOCX, TXT, MD (máx. 20MB por arquivo)</div>
              </div>

              {/* Description Field */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-2">Descrição (opcional)</label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Breve descrição aplicável a todos os documentos"
                  className="w-full resize-none h-24 p-3 rounded-xl border border-zinc-700 bg-zinc-950 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 text-sm text-zinc-200 placeholder-zinc-600 transition-all shadow-inner"
                ></textarea>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 pt-4 flex items-center justify-end gap-3 border-t border-zinc-800/60 bg-zinc-950/30">
              <button 
                onClick={closeUploadModal}
                className="px-5 py-2.5 text-sm font-medium text-zinc-400 bg-transparent border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleUploadSubmit}
                disabled={selectedFiles.length === 0 || isUploading}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 shadow-sm shadow-blue-900/20"
              >
                {isUploading ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION MODAL */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  modalConfig.type === 'danger' ? 'bg-red-500/10 text-red-500' :
                  modalConfig.type === 'warning' ? 'bg-yellow-500/10 text-yellow-500' :
                  'bg-blue-500/10 text-blue-500'
                }`}>
                  {modalConfig.type === 'danger' && <AlertTriangle size={20} />}
                  {modalConfig.type === 'warning' && <Info size={20} />}
                  {modalConfig.type === 'info' && <RefreshCw size={20} />}
                </div>
                <button onClick={closeModal} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1">
                  <X size={20} />
                </button>
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">{modalConfig.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{modalConfig.message}</p>
            </div>
            <div className="p-4 bg-zinc-950/50 border-t border-zinc-800/60 flex items-center justify-end gap-3">
              <button 
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={modalConfig.onConfirm}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                  modalConfig.type === 'danger' ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20' :
                  modalConfig.type === 'warning' ? 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-yellow-900/20' :
                  'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                }`}
              >
                {modalConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}