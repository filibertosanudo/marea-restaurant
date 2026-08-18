import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#FFFFFF",
        "surface-subtle": "#F8F9FA",
        "surface-ocean": "#ECF5F8",
        "surface-ocean-border": "#D6E9EF",
        "on-surface": "#232C3B",
        "on-surface-muted": "#57646C",
        border: "#E2E5E8",
        primary: {
          DEFAULT: "#1B367B",
          hover: "#16295F",
        },
        "on-primary": "#FFFFFF",
        "accent-warm": {
          DEFAULT: "#F0E7D5",
          border: "#D8CCB4",
        },
        "on-accent-warm": "#6F6A5C",
        success: "#1F8A5F",
        warning: "#C77D19",
        error: "#C0392B",
        info: "#2C6FBB",
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
        1: "0 2px 10px rgba(27, 54, 123, 0.10)",
        2: "0 10px 28px rgba(27, 54, 123, 0.18)",
        hero: "0 30px 60px rgba(27, 54, 123, 0.24)",
      },
    },
  },
  plugins: [],
};

export default config;
