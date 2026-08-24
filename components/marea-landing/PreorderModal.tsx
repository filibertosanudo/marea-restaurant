"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { STR, TIME_SLOTS, type Dish, type Lang } from "./content";
import { Dropdown } from "./Dropdown";
import { Placeholder } from "./Placeholder";

type PreorderModalProps = {
  dish: Dish | null;
  lang: Lang;
  onClose: () => void;
};

export function PreorderModal({ dish, lang, onClose }: PreorderModalProps) {
  const t = STR[lang].preorder;
  const [qty, setQty] = useState(1);
  const [time, setTime] = useState("19:00");

  useEffect(() => {
    if (dish) setQty(1);
  }, [dish]);

  return (
    <Modal open={dish !== null} onClose={onClose} title={dish?.name}>
      {dish && (
        <form
          className="ml-preorder-form"
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <div className="ml-preorder-top">
            <div className="ml-preorder-thumb">
              <Placeholder label={dish.img} />
            </div>
            <div className="ml-preorder-price">{dish.price}</div>
            <div className="ml-qty">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span>{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => q + 1)}>
                +
              </button>
            </div>
          </div>

          <div className="field">
            <Input id="po-name" label="" placeholder={t.namePh} required />
          </div>
          <div className="field">
            <Input id="po-phone" label="" type="tel" placeholder={t.phonePh} required />
          </div>
          <div className="field">
            <Input id="po-guests" label="" type="number" min={1} placeholder={t.guestsPh} />
          </div>
          <div className="ml-form-row">
            <div className="field">
              <Input id="po-date" label="" type="date" />
            </div>
            <div className="field">
              <Dropdown id="po-time" options={TIME_SLOTS} value={time} onChange={setTime} />
            </div>
          </div>
          <div className="ml-ta-field">
            <textarea placeholder={t.commentsPh} />
          </div>

          <Button variant="primary" type="submit" style={{ width: "100%" }}>
            {t.submit}
          </Button>
        </form>
      )}
    </Modal>
  );
}
