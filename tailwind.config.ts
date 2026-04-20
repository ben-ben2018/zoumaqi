import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f5f0e5',
          100: '#e9dcc1',
          300: '#b9986b',
          500: '#7b5e3a',
          700: '#523c24',
          900: '#2a2014'
        },
        moss: {
          100: '#d8e0d4',
          300: '#a5b7a1',
          500: '#6b7f67',
          700: '#3c4a3c'
        },
        river: {
          100: '#d7e3e3',
          300: '#9eb2b7',
          500: '#5c7078',
          700: '#36444a'
        }
      },
      boxShadow: {
        paper: '0 18px 48px rgba(57, 43, 24, 0.18)',
        seal: '0 10px 30px rgba(108, 46, 34, 0.24)'
      },
      fontFamily: {
        display: ['STKaiti', 'KaiTi', 'serif'],
        body: ['"Noto Serif SC"', '"Songti SC"', 'serif']
      }
    }
  },
  plugins: []
} satisfies Config;
