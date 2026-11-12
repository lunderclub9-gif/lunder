/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: {
          DEFAULT: '#101114',
          50: '#f5f5f5',
          100: '#e0e0e0',
          200: '#c0c0c0',
          300: '#858585',
          400: '#555555',
          500: '#333333',
          600: '#222222',
          700: '#1a1a1d',
          800: '#141416',
          900: '#101114',
          950: '#0a0a0b',
        },
        brand: {
          red: '#E32636',
          'red-dark': '#c41f2d',
          'red-light': '#f05362',
        },
        offwhite: '#F5F5F5',
        metallic: '#858585',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
