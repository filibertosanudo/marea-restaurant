import { Button } from "./Button";

type NavLink = { id: string; label: string };

type NavProps = {
  links?: NavLink[];
  ctaLabel?: string;
  onCtaClick?: () => void;
  onLinkClick?: (id: string) => void;
};

const defaultLinks: NavLink[] = [
  { id: "home", label: "Home" },
  { id: "about", label: "About Us" },
  { id: "menu", label: "Our Menu" },
  { id: "testimonials", label: "Testimonials" },
  { id: "contact", label: "Contact" },
];

export function Nav({
  links = defaultLinks,
  ctaLabel = "Book a Table",
  onCtaClick,
  onLinkClick,
}: NavProps) {
  return (
    <nav className="flex w-fit items-center gap-lg rounded-full bg-surface px-lg py-[12px] shadow-1">
      <span className="font-display text-lg font-semibold text-primary">
        Marea
      </span>
      <ul className="hidden gap-md text-sm text-on-surface-muted sm:flex">
        {links.map((link) => (
          <li key={link.id}>
            <button
              type="button"
              onClick={() => onLinkClick?.(link.id)}
              className="cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-inherit hover:text-on-surface"
            >
              {link.label}
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="primary"
        className="px-[18px] py-[8px] text-[13px]"
        onClick={onCtaClick}
      >
        {ctaLabel}
      </Button>
    </nav>
  );
}
