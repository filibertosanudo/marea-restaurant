"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/ui/Nav";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { TestimonialCard } from "@/components/ui/TestimonialCard";
import { StatItem } from "@/components/ui/StatItem";
import { STR, TIME_SLOTS, type Dish as DishData, type Lang } from "./content";
import { Controls } from "./Controls";
import { Dropdown } from "./Dropdown";
import { SectionHead } from "./SectionHead";
import { Placeholder } from "./Placeholder";
import { OfferCard } from "./OfferCard";
import { Dish } from "./Dish";
import { Highlight } from "./Highlight";
import { PreorderModal } from "./PreorderModal";
import { scrollToId } from "./scroll";
import { ArrowIcon } from "./icons";
import "./marea-landing.css";

type Theme = "light" | "dark";

export function MareaLandingPage() {
  const [cat, setCat] = useState("mains");
  const [guests, setGuests] = useState("2");
  const [time, setTime] = useState("19:00");
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [preorderDish, setPreorderDish] = useState<DishData | null>(null);

  useEffect(() => {
    const storedLang = localStorage.getItem("marea-lang") as Lang | null;
    const storedTheme = localStorage.getItem("marea-theme") as Theme | null;
    if (storedLang) setLang(storedLang);
    if (storedTheme) setTheme(storedTheme);
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("marea-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("marea-lang", lang);
  }, [lang]);

  const t = STR[lang];
  const guestOptions = [1, 2, 3, 4, 5, 6]
    .map((n) => ({
      value: String(n),
      label: `${n} ${n === 1 ? t.reserve.guest : t.reserve.guestP}`,
    }))
    .concat([{ value: "7", label: t.reserve.guestPlus }]);

  return (
    <>
      <Controls theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />
      <div className="ml-navbar">
        <Nav onCtaClick={() => scrollToId("reservation")} onLinkClick={scrollToId} />
      </div>

      {/* HERO */}
      <header className="ml-hero ml-section" id="home">
        <div className="ml-hero-bg">
          <Placeholder label={t.hero.photo} navy />
        </div>
        <div className="ml-hero-inner">
          <div className="ml-hero-right">
            <div className="ml-eyebrow">{t.hero.eyebrow}</div>
            <h1 className="ml-disp">
              {t.hero.h1Before}
              <Highlight>{t.hero.h1Highlight}</Highlight>
              {t.hero.h1After}
            </h1>
            <div className="ml-hero-row">
              <p>{t.hero.sub}</p>
              <Button variant="primary" onClick={() => scrollToId("reservation")}>
                {t.hero.book}
              </Button>
            </div>
            <div className="ml-promo">
              <h3>{t.hero.promoTitle}</h3>
              <p>{t.hero.promoBody}</p>
              <a className="promo-cta" href="#menu">
                {t.hero.viewMenu}
                <span className="pc-arrow">
                  <ArrowIcon />
                </span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ABOUT */}
      <section className="ml-band ml-section" id="about">
        <div className="ml-wrap ml-about-grid">
          <div>
            <SectionHead eyebrow={t.about.eyebrow} title={t.about.title} />
            <p className="ml-lead" style={{ marginTop: 20 }}>
              {t.about.body}
            </p>
          </div>
          <div className="ml-stat-grid">
            {t.stats.map((s) => (
              <StatItem key={s.l} value={s.v} label={s.l} />
            ))}
          </div>
        </div>
      </section>

      {/* MENU */}
      <section className="ml-band subtle ml-section" id="menu">
        <div className="ml-wrap">
          <SectionHead center eyebrow={t.menu.eyebrow} title={t.menu.title} lead={t.menu.lead} />
          <div className="ml-menu-tabs">
            <Tabs items={t.categories as unknown as { id: string; label: string }[]} value={cat} onChange={setCat} />
          </div>
          <div className="ml-menu-grid" key={cat}>
            {t.dishes
              .filter((d) => d.category === cat)
              .map((d) => (
                <Dish
                  key={d.name}
                  dish={d}
                  cta={t.menu.preorder}
                  onPreorder={() => setPreorderDish(d)}
                />
              ))}
          </div>
          <div className="ml-menu-actions">
            <Button variant="primary" onClick={() => scrollToId("reservation")}>
              {t.menu.book}
            </Button>
          </div>
        </div>
      </section>

      {/* OFFERS */}
      <section className="ml-band ocean ml-section" id="offers">
        <div className="ml-wrap">
          <SectionHead
            center
            eyebrow={t.offers.eyebrow}
            title={
              <>
                {t.offers.titleBefore}
                <Highlight>{t.offers.titleHighlight}</Highlight>
                {t.offers.titleAfter}
              </>
            }
          />
          <div className="ml-offer-stage">
            <div className="ml-offer-col">
              {t.offers.left.map((o) => (
                <OfferCard key={o.title} offer={o} onArrowClick={() => scrollToId("reservation")} />
              ))}
            </div>
            <div className="ml-offer-media">
              <Placeholder label={t.offers.dish} />
            </div>
            <div className="ml-offer-col">
              {t.offers.right.map((o) => (
                <OfferCard key={o.title} offer={o} onArrowClick={() => scrollToId("reservation")} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="ml-band ml-section" id="testimonials">
        <div className="ml-wrap">
          <SectionHead center eyebrow={t.tmls.eyebrow} title={t.tmls.title} />
          <div className="ml-tmls">
            <div className="ml-tmls-cards">
              {t.tmls.items.map((it) => (
                <TestimonialCard key={it.name} quote={it.quote} name={it.name} />
              ))}
            </div>
            <div className="ml-tmls-media">
              <Placeholder label={t.tmls.media} />
            </div>
          </div>
        </div>
      </section>

      {/* RESERVATION */}
      <section className="ml-band subtle ml-section ml-reserve-section" id="reservation">
        <div className="ml-reserve-media">
          <Placeholder label={t.reserve.media} />
        </div>
        <div className="ml-reserve-inner">
          <div className="ml-reserve-form-wrap">
            <SectionHead eyebrow={t.reserve.eyebrow} title={t.reserve.title} />
            <form
              className="ml-form-card"
              style={{ marginTop: 28 }}
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="field">
                <Input id="r-name" label={t.reserve.name} placeholder={t.reserve.namePh} />
              </div>
              <div className="ml-form-row">
                <div className="field">
                  <Input id="r-contact" label={t.reserve.contact} placeholder={t.reserve.contactPh} />
                </div>
                <div className="field">
                  <Dropdown
                    id="r-guests"
                    label={t.reserve.guests}
                    options={guestOptions}
                    value={guests}
                    onChange={setGuests}
                  />
                </div>
              </div>
              <div className="ml-form-row">
                <div className="field">
                  <Input id="r-date" label={t.reserve.date} type="date" />
                </div>
                <div className="field">
                  <Dropdown
                    id="r-time"
                    label={t.reserve.time}
                    options={TIME_SLOTS}
                    value={time}
                    onChange={setTime}
                  />
                </div>
              </div>
              <div className="ml-ta-field">
                <label htmlFor="r-notes">{t.reserve.comments}</label>
                <textarea id="r-notes" placeholder={t.reserve.commentsPh} />
              </div>
              <Button variant="primary" type="submit" style={{ width: "100%" }}>
                {t.reserve.submit}
              </Button>
            </form>
          </div>
        </div>
      </section>

      <footer className="ml-footer ml-section" id="contact">
        <div className="ml-wrap">
          <div className="ml-foot-top">
            <h3>{t.footer.connect}</h3>
            <form className="ml-news" onSubmit={(e) => e.preventDefault()}>
              <div className="field">
                <Input id="news-email" label="" placeholder={t.footer.emailPh} type="email" />
              </div>
              <Button variant="secondary" type="submit">
                {t.footer.subscribe}
              </Button>
            </form>
          </div>
          <div className="ml-foot-mid">
            <div>
              <div className="brand">Marea</div>
              <p>{t.footer.blurb}</p>
            </div>
            <div>
              <h4>{t.footer.visit}</h4>
              <p>
                {t.footer.address}
                <br />
                {t.footer.address2}
              </p>
              <p>{t.footer.hours}</p>
            </div>
            <div>
              <h4>{t.footer.contact}</h4>
              <a href="tel:+15551234567">+1 (555) 123-4567</a>
              <a href="mailto:hello@marea.com">hello@marea.com</a>
              <a href="#menu">{t.footer.ourMenu}</a>
              <a href="#reservation">{t.footer.reservations}</a>
            </div>
          </div>
          <div className="ml-foot-bottom">
            <div>{t.footer.copyright}</div>
            <div>{t.footer.tagline}</div>
          </div>
        </div>
      </footer>

      <PreorderModal dish={preorderDish} lang={lang} onClose={() => setPreorderDish(null)} />
    </>
  );
}
