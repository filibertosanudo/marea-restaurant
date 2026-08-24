import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // rgb(var(--x) / <alpha-value>) lets Tailwind opacity modifiers
        // (e.g. bg-on-surface/40) keep working while the underlying value
        // switches with [data-theme="dark"] — see styles/tokens.css.
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-subtle": "rgb(var(--color-surface-subtle) / <alpha-value>)",
        "surface-ocean": "rgb(var(--color-surface-ocean) / <alpha-value>)",
        "surface-ocean-border":
          "rgb(var(--color-surface-ocean-border) / <alpha-value>)",
        "surface-raised": "rgb(var(--color-surface-raised) / <alpha-value>)",
        "on-surface": "rgb(var(--color-on-surface) / <alpha-value>)",
        "on-surface-muted":
          "rgb(var(--color-on-surface-muted) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
        },
        "on-primary": "rgb(var(--color-on-primary) / <alpha-value>)",
        "accent-warm": {
          DEFAULT: "rgb(var(--color-accent-warm) / <alpha-value>)",
          border: "rgb(var(--color-accent-warm-border) / <alpha-value>)",
        },
        "on-accent-warm": "rgb(var(--color-on-accent-warm) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        error: "rgb(var(--color-error) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-montserrat-alternates)", "sans-serif"],
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "20px",
        xl: "28px",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
        "3xl": "64px",
        "4xl": "96px",
      },
      boxShadow: {
        1: "0 2px 10px rgb(var(--shadow-color) / 0.10)",
        2: "0 10px 28px rgb(var(--shadow-color) / 0.18)",
        hero: "0 30px 60px rgb(var(--shadow-color) / 0.24)",
      },
    },
  },
  plugins: [],
};

export default config;
