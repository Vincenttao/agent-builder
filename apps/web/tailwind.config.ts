import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0f766e',
          dark: '#115e59',
          soft: '#ccfbf1',
          ink: '#042f2e',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgb(15 23 42 / 0.06), 0 8px 24px rgb(15 23 42 / 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
