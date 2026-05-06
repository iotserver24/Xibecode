/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        xibe: {
          bg: '#09090b',
          surface: '#18181b',
          border: '#3f3f46',
          muted: '#71717a',
          text: '#fafafa',
          accent: '#f4f4f5',
          'accent-dim': '#e4e4e7',
          warning: '#a1a1aa',
          error: '#f87171',
          info: '#a1a1aa',
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
