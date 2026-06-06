import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.9375rem', { lineHeight: '1.5rem' }],
        base: ['1.0625rem', { lineHeight: '1.625rem' }],
        lg: ['1.1875rem', { lineHeight: '1.75rem' }],
        xl: ['1.375rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.625rem', { lineHeight: '2rem' }],
        '3xl': ['2rem', { lineHeight: '2.25rem' }],
      },
    },
  },
  plugins: [],
}
export default config
