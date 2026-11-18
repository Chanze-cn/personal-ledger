/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F4F6F9',
        ink: '#0D1526',
        muted: '#64748B',
        brand: '#4F46E5',
        income: '#059669',
        expense: '#E11D48',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Inter',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,21,38,.04), 0 12px 32px -18px rgba(13,21,38,.28)',
        float: '0 24px 60px -24px rgba(13,21,38,.35)',
      },
      borderRadius: {
        xl2: '20px',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.22,.61,.36,1) both',
        fade: 'fade .4s ease both',
      },
    },
  },
  plugins: [],
};
