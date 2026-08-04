/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // Marca Auleka
        brand: {
          blue: '#2563EB',
          'blue-dark': '#1D4ED8',
          green: '#16A34A',
          'green-dark': '#15803D',
        },
        // Paleta de la experiencia privada "The Hilda" (/the-hilda)
        hilda: {
          ink: '#0b0a08',
          panel: '#171310',
          paper: '#efe6d3',
          gold: '#c9a24b',
          'gold-light': '#e6c878',
          'gold-dark': '#9c7a33',
          red: '#8a2d24',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        // Tipografías de la experiencia privada "The Hilda" (/the-hilda)
        'hilda-display': ['"Playfair Display"', 'serif'],
        'hilda-body': ['"Lora"', 'serif'],
        'hilda-hand': ['"Caveat"', 'cursive'],
        'hilda-type': ['"Special Elite"', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2563EB 0%, #16A34A 100%)',
      },
    },
  },
  plugins: [],
}
