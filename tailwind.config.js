/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F2EEE3',
        ink: '#14130F',
        signal: '#E4410B',
        moss: '#2F4A3A',
        ochre: '#C48A1A',
      },
      boxShadow: {
        ledger: '8px 8px 0 0 rgba(20, 19, 15, 1)',
      },
      fontFamily: {
        display: ['Instrument Serif', 'Georgia', 'serif'],
        sans: ['Schibsted Grotesk', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
