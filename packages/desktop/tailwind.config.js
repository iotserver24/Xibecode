/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        xibe: {
          bg: '#0D0D12',
          surface: '#16161D',
          border: '#2A2A35',
          muted: '#6b7280',
          text: '#E2E2E9',
          accent: '#3B82F6',
          'accent-dim': '#2563EB',
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
