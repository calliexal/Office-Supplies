import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#06405b', deep: '#012333' },
        brand: { DEFAULT: '#ea7241', soft: '#ffede5' },
        sky: { DEFAULT: '#eaf8ff', link: '#65ccff' },
        ink: { DEFAULT: '#101010', 700: '#1e1e1e', 600: '#464646', 500: '#626262', 400: '#9a9a9a' },
        danger: { DEFAULT: '#ff3f3d', soft: '#ffd2d2', tint: 'rgba(255,190,193,0.49)' },
        warning: { DEFAULT: '#ffa628', soft: '#fff6b3' },
        success: { DEFAULT: '#6bcb77', soft: 'rgba(204,255,210,0.88)' },
        violet: { DEFAULT: '#8a38f5', soft: '#e6d3ff' },
        neutral: { soft: 'rgba(221,221,221,0.98)' },
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        sidebar: '2px 0 7.4px -2px rgba(0,0,0,0.25)',
        icon: '0 1px 2px rgba(0,0,0,0.25)',
        stat: '0 4px 2px rgba(30,30,30,0.13)',
        fab: '0 4px 2.3px rgba(0,0,0,0.25)',
      },
      backgroundImage: {
        hero: 'linear-gradient(121.85deg, #012333 6.28%, #06405b 55.8%, #ea7241 115.54%)',
      },
      borderWidth: { 3: '3px' },
    },
  },
  plugins: [],
} satisfies Config;
