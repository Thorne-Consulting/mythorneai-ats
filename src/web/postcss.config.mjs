// Tailwind only processes CSS files that use its directives, which is just the Plate editor's
// stylesheet (src/components/plate/plate.css). Mantine and styles.css pass through untouched.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
