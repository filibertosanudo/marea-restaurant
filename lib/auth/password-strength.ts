import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

export const MIN_PASSWORD_LENGTH = 12;
export const MIN_PASSWORD_SCORE = 3;

let zxcvbn: InstanceType<typeof ZxcvbnFactory> | undefined;

function getZxcvbn() {
  if (!zxcvbn) {
    zxcvbn = new ZxcvbnFactory({
      dictionary: {
        ...zxcvbnCommonPackage.dictionary,
        ...zxcvbnEnPackage.dictionary,
      },
      graphs: zxcvbnCommonPackage.adjacencyGraphs,
      translations: zxcvbnEnPackage.translations,
    });
  }
  return zxcvbn;
}

/** 0 (guessed instantly) through 4 (very hard to guess) — see zxcvbn-ts docs. */
export function passwordScore(password: string): number {
  return getZxcvbn().check(password).score;
}
