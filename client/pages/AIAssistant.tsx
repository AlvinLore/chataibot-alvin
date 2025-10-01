import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, ExternalLink, Loader2, MessageSquare, Edit, Square, Plus, Menu, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  getSuggestions,
  getCategories,
  searchBPSData,
  detectSpecificKeywords,
  BPSDataItem,
} from "@/data/bpsData";
import { findBestMatch } from 'string-similarity';

interface Message {
  id: string;
  content: string;
  type: "user" | "assistant";
  timestamp: Date;
  sources?: Array<{
    title: string;
    url: string;
  }>;
  relatedData?: BPSDataItem[];
}

const GREETING_KEYWORDS = ['halo', 'hai', 'hello', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam', 'pagi', 'siang', 'sore', 'malam', 'hey',
  'apa kabar', 'greetings', 'salutations', 'yo', 'hiya', 'howdy', 'syalom', 'horas', 'alo'
];

const detectQuestionType = (question: string): string => {
  const lower = question.toLowerCase();
  const hasGreeting = GREETING_KEYWORDS.some(greet => lower.includes(greet));
  // Hapus kata sapaan untuk memeriksa apakah ada konten lain
  const questionWithoutGreeting = GREETING_KEYWORDS.reduce(
    (q, greet) => q.replace(greet, ''),
    lower,
  ).trim();
  // Jika ada sapaan DAN ada permintaan lain, anggap sebagai permintaan informasi
  if (hasGreeting && questionWithoutGreeting.replace(/[^\w]/g, '').length > 2) {
    return 'information';
  }
  // Jika hanya ada sapaan
  if (hasGreeting) {
    return 'greeting';
  }
  if (lower.includes('terima kasih') || lower.includes('thanks')) return 'thanks';
  if (lower.includes('siapa') || lower.includes('who') || lower.includes('kamu siapa') || lower.includes('anda siapa')) return 'identity';
  if (lower.includes('list') || lower.includes('daftar') || lower.includes('kategori')) return 'list';
  return 'information';
};

// Fungsi baru untuk mengekstrak sapaan
const extractGreeting = (question: string): string => {
  const lowerQuestion = question.toLowerCase();
  // Urutkan sapaan dari yang terpanjang agar "selamat pagi" terdeteksi sebelum "pagi"
  const sortedGreetings = [...GREETING_KEYWORDS].sort((a, b) => b.length - a.length);
  const matchedGreeting = sortedGreetings.find(g => lowerQuestion.includes(g));
  if (matchedGreeting) {
    const capitalizedGreeting = matchedGreeting.charAt(0).toUpperCase() + matchedGreeting.slice(1);
    // Kembalikan sapaan balasan dengan spasi di akhir
    return `${capitalizedGreeting} juga! `;
  }
  // Kembalikan string kosong jika tidak ada sapaan
  return ""; 
};

const FILLER_WORDS = [
  // Kata Perintah & Permintaan (Command & Request Words)
  'tolong', 'carikan', 'berikan', 'kasih', 'mohon', 'coba', 'lihat', 'beri','cari', 'cariin', 'carikan', 'cariin',
  'tampilkan', 'tunjuk', 'tunjukin', 'tunjukkan', 'sajikan', 'buatkan', 'kirimkan', 'minta',
  // Kata Tanya (Question Words)
  'apa', 'apakah', 'bagaimana', 'di mana', 'kapan', 'mengapa', 'siapa', 'berapa',
  'adakah', 'bisakah', 'bisa', 'bisaka',
  // Kata Ganti (Pronouns)
  'saya', 'aku', 'anda', 'kamu', 'dia', 'ia', 'kita', 'kami', 'kalian', 'mereka',
  'ku', 'mu', 'nya',
  // Kata Sambung & Preposisi (Conjunctions & Prepositions)
  'tapi', 'namun', 'serta', 'lalu', 'kemudian', 'di', 'ke', 'dari',
  'pada', 'untuk', 'dengan', 'tentang', 'yang', 'padaku', 'padamu',
  'padanya', 'oleh', 'sebagai', 'karena', 'agar', 'supaya',
  // Kata Keterangan Umum (Common Adverbs/Adjectives)
  'sekarang', 'hari', 'ini', 'itu', 'adalah', 'yaitu', 'yakni', 'seperti', 'saja',
  'semua', 'lebih', 'kurang', 'banyak', 'sedikit', 'ingin', 'mau', 'tahu',
  // Kata Informal & Pengisi (Informal & Filler Words)
  'dong', 'ya', 'ga', 'nggak', 'gak', 'sih', 'deh', 'kok', 'kek', 'kayak', 'tau'
  // Dan lain-lain
  
];

// Fungsi untuk membersihkan query dari kata-kata umum
const cleanQuery = (question: string): string => {
  let lower = question.toLowerCase();
  // 1. Hapus sapaan
  const greetingRegex = new RegExp(`\\b(${GREETING_KEYWORDS.join('|')})\\b`, 'gi');
  let queryWithoutGreetings = lower.replace(greetingRegex, '');
  // 2. Pecah kalimat menjadi kata-kata
  const words = queryWithoutGreetings.split(/\s+/).filter(Boolean);
  // 3. Filter kata-kata yang mirip dengan filler words
  const coreQueryWords = words.filter(word => {
    // Jika kata terlalu pendek, jangan anggap sebagai filler word
    if (word.length < 3) return true;
    // Cari kata yang paling mirip dari daftar FILLER_WORDS
    const { bestMatch } = findBestMatch(word, FILLER_WORDS);
    // Jika tingkat kemiripannya di atas 80%, anggap itu filler word (atau typo-nya) dan hapus.
    if (bestMatch.rating > 0.8) {
      return false; 
    }
    return true;
  });
  // 4. Gabungkan kembali dan bersihkan
  const finalQuery = coreQueryWords.join(' ').replace(/[^\w\s]/g, '').trim();
  return finalQuery.length > 2 ? finalQuery : "data yang Anda minta";
};

const findRelevantData = (question: string): BPSDataItem[] => {
  const keywordResults = detectSpecificKeywords(question);
  const searchResults = searchBPSData(question);

  // Gabungkan hasil dan hapus duplikat
  const combined = [...keywordResults];
  searchResults.forEach(item => {
      if (!combined.find(c => c.url === item.url)) {
          combined.push(item);
      }
  });

  return combined;
};

const generatePersonalizedResponse = (question: string, questionType: string, relevantData: BPSDataItem[]): string => {
  // Panggil fungsi baru untuk mendapatkan awalan sapaan
  const greetingPrefix = extractGreeting(question);
  // Panggil fungsi baru untuk mendapatkan query yang bersih
  const cleanedQuery = cleanQuery(question);
  switch (questionType) {
    case 'greeting':
      return `${greetingPrefix}👋 Senang bertemu dengan Anda! Saya siap membantu Anda menemukan data statistik resmi BPS Kota Medan.`;
    case 'thanks':
      return "Sama-sama! 😊 Saya senang bisa membantu. Silakan tanyakan lagi jika ada yang lain!";
    case 'identity':
      return "Saya adalah AI Data Assistant khusus untuk BPS Kota Medan! 🤖 Saya diciptakan untuk membantu Anda mengakses dan mencari data statistik resmi BPS dengan mudah.";
    case 'list':
      const categories = getCategories();
      let response = `Tentu saja, 📊 BPS Kota Medan memiliki ${categories.length} kategori utama statistik, antara lain:\n\n`;
      categories.forEach((category, index) => {
        response += `${index + 1}. ${category}\n`;
      });
      return response;
    default:
      if (relevantData.length > 0) {
        // Logika untuk memisahkan hasil kata kunci dan hasil pencarian baris
        const keywordResults = detectSpecificKeywords(question);
        const searchResults = relevantData.filter(item => !keywordResults.find(k => k.url === item.url));

        // Awalan sapaan hanya akan ditambahkan jika pengguna memang menyapa
        let responseContent = greetingPrefix + `Tentu, saya menemukan beberapa data yang relevan terkait "${cleanedQuery}".\n\n`;

        if (keywordResults.length > 0) {
            responseContent += `**Berikut hasil yang paling sesuai:**\n`;
            keywordResults.slice(0, 2).forEach(item => {
                responseContent += `- ${item.title}\n`;
            });
        }
        
        if (searchResults.length > 0) {
            responseContent += `\n**Mungkin Anda juga tertarik dengan data ini:**\n`;
            searchResults.slice(0, 3).forEach(item => {
                responseContent += `- ${item.title}\n`;
            });
        }
        
        responseContent += `\nUntuk informasi lebih detail, Anda bisa langsung mengunjungi tautan sumber resmi BPS di bawah ini. 🔗`;
        return responseContent;
      } else {
        // Tambahkan sapaan jika ada, bahkan jika data tidak ditemukan
        return greetingPrefix + `Maaf, saya tidak menemukan data yang relevan dengan pertanyaan Anda. 🙏 Coba gunakan kata kunci yang lebih spesifik seperti "populasi", "ekonomi", "pendidikan", atau "infrastruktur".`;
      }
  }
};

// Chat Message Component
const ChatMessage = ({ message, onEdit, isEditing }: {
  message: Message,
  onEdit: (id: string, content: string) => void,
  isEditing: boolean
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`group flex w-full ${message.type === "user" ? "justify-end" : "justify-start"} mb-6`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex max-w-[85%] ${message.type === "user" ? "flex-row-reverse" : "flex-row"} gap-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          message.type === "user"
            ? "bg-orange-500 text-white"
            : "bg-gray-100 border border-gray-200 text-gray-600"
        }`}>
          {message.type === "user"
            ? <User className="w-4 h-4" />
            : <Bot className="w-4 h-4" />
          }
        </div>

        {/* Message Content */}
        <div className={`relative flex-1 ${message.type === "user" ? "text-right" : "text-left"}`}>
          <div className={`inline-block max-w-full p-4 rounded-2xl ${
            message.type === "user"
              ? "bg-gray-100 text-gray-900"
              : "bg-white border border-gray-200 text-gray-900"
          }`}>
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap m-0 leading-relaxed">
                {message.content}
              </p>
            </div>

            {/* Sources */}
            {message.sources && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-600 mb-2">Sumber Data:</p>
                <div className="space-y-1">
                  {message.sources.map((source, index) => (
                    <a
                      key={index}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {source.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Edit Button */}
          {message.type === "user" && isHovered && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
              onClick={() => onEdit(message.id, message.content)}
              disabled={isEditing}
            >
              <Edit className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Welcome Screen Component
const WelcomeScreen = ({ handleSuggestionClick }: { handleSuggestionClick: (q: string) => void }) => {
  const suggestions = getSuggestions('');

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mb-6">
        <Bot className="w-8 h-8 text-white" />
      </div>

      <h1 className="text-3xl font-semibold text-gray-900 mb-3">
        Selamat datang di StatMedan AI
      </h1>

      <p className="text-gray-600 text-lg mb-8 max-w-md">
        Saya siap membantu Anda menemukan data statistik resmi dari BPS Kota Medan.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
        {suggestions.slice(0, 6).map((suggestion, index) => (
          <Button
            key={index}
            variant="outline"
            className="h-auto p-4 text-left justify-start whitespace-normal border-gray-200 hover:bg-gray-50 rounded-xl"
            onClick={() => handleSuggestionClick(suggestion)}
          >
            <span className="text-gray-700">{suggestion}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};

// Sidebar Component
const Sidebar = ({ isOpen, onClose, onNewChat, chatHistory }: {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chatHistory: Message[];
}) => {
  const userMessages = chatHistory.filter(msg => msg.type === "user");

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-80 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:static lg:z-0`}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-orange-500" />
            <span className="font-semibold text-gray-900">StatMedan AI</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* New Chat Button */}
        <div className="p-4">
          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="w-4 h-4" />
            Chat Baru
          </Button>
        </div>

        {/* Chat History */}
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Riwayat Chat</h3>
          {userMessages.length > 0 ? (
            <div className="space-y-2">
              {userMessages.slice(-5).map((msg) => (
                <div
                  key={msg.id}
                  className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <p className="text-sm text-gray-700 truncate">
                    {msg.content}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {msg.timestamp.toLocaleDateString('id-ID')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Belum ada riwayat chat</p>
          )}
        </div>
      </div>
    </>
  );
};

// Main Component
export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const typingTimeoutRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Hanya scroll jika pesan terakhir bukan dari user
    if (messages.length > 0 && messages[messages.length - 1].type !== 'user') {
        // Scroll di awal respons, bukan di setiap karakter
        if (messages[messages.length - 1].content.length < 5) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const simulateTyping = (fullContent: string, messageId: string) => {
    if (typingTimeoutRef.current) {
      window.clearInterval(typingTimeoutRef.current);
    }

    let i = 0;
    const interval = window.setInterval(() => {
      setMessages(prev => {
        return prev.map(msg =>
          msg.id === messageId
            ? { ...msg, content: fullContent.substring(0, i + 1) }
            : msg
        );
      });

      i++;
      if (i >= fullContent.length) {
        window.clearInterval(interval);
        setIsTyping(false);
      }
    }, 5);

    typingTimeoutRef.current = interval;
  };

  const stopTyping = () => {
    if (typingTimeoutRef.current) {
      window.clearInterval(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setIsTyping(false);
  };

  const handleNewChat = () => {
    if (typingTimeoutRef.current) {
      stopTyping();
    }
    setMessages([]);
    setInput("");
    setEditingMessageId(null);
    setSidebarOpen(false);
  };

  const handleSubmit = async (question?: string) => {
    const currentInput = question || input;
    if (!currentInput.trim() || isLoading) return;

    if (isTyping) {
      stopTyping();
      return;
    }

    let userMessage: Message;

    if (editingMessageId) {
      setMessages(prev => prev.map(msg =>
        msg.id === editingMessageId
          ? { ...msg, content: currentInput }
          : msg
      ));
      userMessage = messages.find(msg => msg.id === editingMessageId)!;
      setEditingMessageId(null);
    } else {
      userMessage = {
        id: Date.now().toString(),
        content: currentInput,
        type: "user",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
    }

    setInput("");
    setIsLoading(true);

    const responseId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: responseId,
      content: "",
      type: "assistant",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsTyping(true);

    // Simulate processing time with original AI logic
    const processingTime = Math.random() * 1000 + 1500;

    setTimeout(() => {
      const questionType = detectQuestionType(currentInput);
      const relevantData = findRelevantData(currentInput);
      const responseContent = generatePersonalizedResponse(currentInput, questionType, relevantData);

      // Update message with sources and related data
      setMessages(prev => prev.map(msg =>
        msg.id === responseId
          ? {
              ...msg,
              sources: relevantData.length > 0 ? relevantData.map(item => ({
                title: item.title,
                url: item.url
              })) : questionType !== 'greeting' && questionType !== 'thanks' && questionType !== 'identity' && questionType !== 'list' ? [{
                title: "Portal Resmi BPS Kota Medan",
                url: "https://medankota.bps.go.id/id"
              }] : undefined,
              relatedData: relevantData.length > 0 ? relevantData : undefined,
            }
          : msg
      ));

      simulateTyping(responseContent, responseId);
      setIsLoading(false);
    }, processingTime);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleEdit = (id: string, content: string) => {
    setEditingMessageId(id);
    setInput(content);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        chatHistory={messages}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:ml-0">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-gray-200 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold">StatMedan AI</h1>
          <div className="w-8" /> {/* Spacer */}
        </header>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {messages.length === 0 ? (
              <WelcomeScreen handleSuggestionClick={handleSubmit} />
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onEdit={handleEdit}
                    isEditing={!!editingMessageId}
                  />
                ))}
                {isLoading && (
                  <div className="flex justify-start mb-6">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-gray-600" />
                      </div>
                      <div className="bg-white border border-gray-200 rounded-2xl p-4">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-3 p-3 border border-gray-300 rounded-2xl bg-white focus-within:border-orange-500 transition-colors">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={editingMessageId ? "Edit pesan..." : "Tanyakan sesuatu tentang data BPS Kota Medan..."}
                className="flex-1 min-h-[24px] max-h-32 resize-none border-0 bg-transparent p-0 text-base placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                disabled={isLoading}
                rows={1}
              />
              <Button
                type="submit"
                onClick={() => handleSubmit()}
                disabled={(!input.trim() && !isTyping) || isLoading}
                size="sm"
                className="h-8 w-8 p-0 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300"
              >
                {isTyping ? (
                  <Square className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Footer Text */}
            <p className="text-xs text-gray-500 text-center mt-3">
              AI Assistant dapat membuat kesalahan. Verifikasi informasi penting dengan sumber resmi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}