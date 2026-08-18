import { Lang } from "./content";
import { MoonIcon, SunIcon } from "./icons";

type ControlsProps = {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
};

export function Controls({ theme, setTheme, lang, setLang }: ControlsProps) {
  return (
    <div className="ml-controls">
      <div className="ml-seg" role="group" aria-label="Language">
        <button
          className={lang === "en" ? "active" : ""}
          onClick={() => setLang("en")}
          type="button"
        >
          EN
        </button>
        <button
          className={lang === "es" ? "active" : ""}
          onClick={() => setLang("es")}
          type="button"
        >
          ES
        </button>
      </div>
      <div className="ml-seg" role="group" aria-label="Theme">
        <button
          className="icon-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          type="button"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  );
}
