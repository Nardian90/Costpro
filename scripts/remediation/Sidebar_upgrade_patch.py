import sys

file_path = 'src/components/views/terminal/Sidebar.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add Zap icon to imports
if 'Zap' not in content:
    content = content.replace('LogOut,', 'LogOut, Zap,')

# Add handleUpgrade click handler and Upgrade button
upgrade_button = """
          {user?.plan === 'free' && (
            <button
              onClick={() => {
                const whatsappNumber = "+5353183215";
                const message = encodeURIComponent("Hola, me interesa obtener el Plan Pro de CostoPro para tener acceso ilimitado.");
                window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
              }}
              className="w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 bg-primary/10 text-primary border border-primary/20 font-black mb-2 animate-pulse"
            >
              <Zap className="w-4.5 h-4.5 text-primary" />
              <div className="flex flex-col items-start">
                <span className="text-[10px] uppercase tracking-widest">Plan Gratuito</span>
                <span className="text-[8px] uppercase tracking-[0.2em] opacity-70">Subir a PRO</span>
              </div>
            </button>
          )}
"""

# Insert before Calculator button
content = content.replace('<button\n            onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}',
                          upgrade_button + '          <button\n            onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}')

with open(file_path, 'w') as f:
    f.write(content)
