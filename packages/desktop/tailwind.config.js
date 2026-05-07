/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        xibe: {
          bg: '#09090b',
          surface: '#18181b',
          border: '#27272a',
          muted: '#71717a',
          text: '#fafafa',
          accent: '#fafafa',
          'accent-dim': '#a1a1aa',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#0EA5E9',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
