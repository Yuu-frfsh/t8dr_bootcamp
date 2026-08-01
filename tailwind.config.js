/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Camp host brand.
        primary: '#7D63AB',
        'primary-dark': '#573D85',
        'primary-light': '#A389D1',
        'primary-reverse': '#FFFFFF',

        bg: '#FFFFFF',
        surface: '#F4F4F5',
        text: '#18181B',
        muted: '#71717A',
        border: '#D4D4D8',
        // Reserved for "the audio did not work" and nothing else. Do not use
        // this for emphasis, urgency, or a category - a user who cannot hear
        // the output reads red as failure. See searchIndex.test.js.
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
