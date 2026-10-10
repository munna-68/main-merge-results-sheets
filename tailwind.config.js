/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#0a0a0a',
        paper: '#ffffff',
        line: '#e5e5e5',
        muted: '#737373',
        danger: '#b91c1c',
        dangerbg: '#fef2f2',
        warn: '#92400e',
        warnbg: '#fffbeb',
        ok: '#15803d',
        okbg: '#f0fdf4',
      },
      borderRadius: {
        card: '1rem',
      },
    },
  },
  plugins: [],
};