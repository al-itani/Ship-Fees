/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F5F6FA',
        surface: '#FFFFFF',
        sidebar: '#1B2A4A',
        'sidebar-active': '#2E4D8A',
        primary: '#2E4D8A',
        'primary-hover': '#1B3A6B',
        danger: '#C0392B',
        success: '#27AE60',
        border: '#DDE1E9',
        'app-text': '#1A1A2E',
        'text-muted': '#6C757D',
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
