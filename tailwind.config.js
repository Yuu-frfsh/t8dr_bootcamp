/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        surface: '#F4F4F5',
        text: '#18181B',
        muted: '#71717A',
        border: '#D4D4D8',
        danger: '#DC2626',
        success: '#16A34A',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'sans-serif'],
      },
      spacing: {
        // minimum touch target, per SPEC section 11
        touch: '88px',
      },
    },
  },
  plugins: [],
};
