import { Button } from "./Button";

const links = ["Home", "About Us", "Our Menu", "Testimonials", "Contact"];

export function Nav() {
  return (
    <nav className="flex w-fit items-center gap-lg rounded-full bg-surface px-lg py-[12px] shadow-1">
      <span className="font-display text-lg font-semibold text-primary">
        Marea
      </span>
      <ul className="hidden gap-md text-sm text-on-surface-muted sm:flex">
        {links.map((link) => (
          <li key={link} className="cursor-pointer hover:text-on-surface">
            {link}
          </li>
        ))}
      </ul>
      <Button variant="primary" className="px-[18px] py-[8px] text-[13px]">
        Book a Table
      </Button>
    </nav>
  );
}
