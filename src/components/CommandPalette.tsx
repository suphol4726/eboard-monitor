import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, Settings, Activity, LayoutDashboard, Server, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

const commands = [
  { id: 'dashboard', label: 'Go to Dashboard', icon: LayoutDashboard },
  { id: 'devices', label: 'Go to Device Management', icon: Server },
  { id: 'monitor', label: 'Go to Latency Monitor', icon: Activity },
  { id: 'history', label: 'Go to Downtime History', icon: History },
  { id: 'settings', label: 'Go to Settings', icon: Settings },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNavigate }) => {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
              <Search className="w-5 h-5 text-slate-400" />
              <input 
                ref={inputRef}
                type="text"
                placeholder="Type a command..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent outline-none text-slate-800 dark:text-white placeholder-slate-400"
              />
              <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500">ESC</kbd>
            </div>
            <div className="p-2">
              {filteredCommands.length > 0 ? (
                filteredCommands.map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => { onNavigate(cmd.id); onClose(); }}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <cmd.icon className="w-4 h-4 text-slate-500 group-hover:text-blue-500" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{cmd.label}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                  </button>
                ))
              ) : (
                <p className="p-4 text-sm text-center text-slate-500">No commands found.</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
