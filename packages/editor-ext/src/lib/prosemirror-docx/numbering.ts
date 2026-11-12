import { AlignmentType, convertInchesToTwip, ILevelsOptions, LevelFormat } from 'docx';
import { INumbering } from './types';

function basicIndentStyle(indent: number): Pick<ILevelsOptions, 'style' | 'alignment'> {
  return {
    alignment: AlignmentType.START,
    style: {
      paragraph: {
        indent: { left: convertInchesToTwip(indent), hanging: convertInchesToTwip(0.18) },
      },
    },
  };
}

const numbered = Array(3)
  .fill([LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN])
  .flat()
  .map((format, level) => ({
    level,
    format,
    text: `%${level + 1}.`,
    ...basicIndentStyle((level + 1) / 2),
  }));

const numberedParen = numbered.map((l) => ({ ...l, text: `%${l.level + 1})` }));

// 1. 1.1. 1.1.1. — every level decimal, joined with the levels above it.
const numberedLegal = numbered.map((l) => ({
  ...l,
  format: LevelFormat.DECIMAL,
  text: `${Array.from({ length: l.level + 1 }, (_, i) => `%${i + 1}`).join('.')}.`,
  ...basicIndentStyle((l.level + 1) / 2 + l.level * 0.1),
}));

const bullets = Array(3)
  .fill(['●', '○', '■'])
  .flat()
  .map((text, level) => ({
    level,
    format: LevelFormat.BULLET,
    text,
    ...basicIndentStyle((level + 1) / 2),
  }));

const styles = {
  numbered,
  numberedParen,
  numberedLegal,
  bullets,
};

export type NumberingStyles = keyof typeof styles;

export function createNumbering(reference: string, style: NumberingStyles): INumbering {
  return {
    reference,
    levels: styles[style],
  };
}
