/**
 * What a print job's payload actually is — resolved server-side, agnostic
 * of any printer protocol. The agent (outside this codebase, see agent/)
 * is the only thing that ever turns this into ESC/POS bytes; nothing in
 * this package knows a code page or a cut command exists. That split is
 * the point: a formatting fix is a server deploy, never a visit to a
 * restaurant to update the agent.
 */
export type PrintTextLine = {
  type: "text";
  text: string;
  bold?: boolean;
  size?: "normal" | "large";
  align?: "left" | "center";
};

/** The one line meant to be impossible to miss — printed in reverse (light text on a dark block) rather than merely bold, since a missed "sin cebolla" is what turns into a complaint. */
export type PrintNoteLine = {
  type: "note";
  text: string;
};

export type PrintRuleLine = { type: "rule" };

export type PrintLine = PrintTextLine | PrintRuleLine | PrintNoteLine;

export type PrintDocument = {
  lines: PrintLine[];
  /** Whether the agent should send the paper-cut command after these lines. */
  cut: boolean;
};
