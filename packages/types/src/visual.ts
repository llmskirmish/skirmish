import type { Position } from './prototypes/index.js';

export type Color = string;
export type LineStyle = undefined | 'dashed' | 'dotted';
export type TextAlign = 'center' | 'left' | 'right';

export interface CircleVisualStyle {
  /** Circle radius, default is 0.15 */
  radius?: number;
  /** Fill color in the following format: #ffffff (hex triplet). Default is #ffffff */
  fill?: Color;
  /** Opacity value, default is 0.5 */
  opacity?: number;
  /** Stroke color in the following format: #ffffff (hex triplet). Default is #ffffff */
  stroke?: Color;
  /** Stroke line width, default is 0.1 */
  strokeWidth?: number;
  /** Either undefined (solid line), dashed, or dotted. Default is undefined */
  lineStyle?: LineStyle;
}

export interface LineVisualStyle {
  /** Line width, default is 0.1 */
  width?: number;
  /** Line color in the following format: #ffffff (hex triplet). Default is #ffffff */
  color?: Color;
  /** Opacity value, default is 0.5 */
  opacity?: number;
  /** Either undefined (solid line), dashed, or dotted. Default is undefined */
  lineStyle?: LineStyle;
}

export interface PolyVisualStyle {
  /** Fill color in the following format: #ffffff (hex triplet). Default is #ffffff */
  fill?: Color;
  /** Opacity value, default is 0.5 */
  opacity?: number;
  /** Stroke color in the following format: #ffffff (hex triplet). Default is #ffffff */
  stroke?: Color;
  /** Stroke line width, default is 0.1 */
  strokeWidth?: number;
  /** Either undefined (solid line), dashed, or dotted. Default is undefined */
  lineStyle?: LineStyle;
}

export interface RectVisualStyle {
  fill?: Color;
  opacity?: number;
  stroke?: Color;
  strokeWidth?: number;
  lineStyle?: LineStyle;
}

export interface TextVisualStyle {
  /** Text align, either center, left, or right. Default is center */
  align?: TextAlign;
  /** Background color in the following format: #ffffff (hex triplet) */
  backgroundColor?: Color;
  /** Background rectangle padding, default is 0.3 */
  backgroundPadding?: number;
  /** Font color in the following format: #ffffff (hex triplet). Default is #ffffff */
  color?: Color;
  /** Font specification */
  font?: number | string;
  /** Opacity value, default is 1 */
  opacity?: number;
  /** Stroke color in the following format: #ffffff (hex triplet) */
  stroke?: Color;
  /** Stroke line width, default is 0.15 */
  strokeWidth?: number;
}

/**
 * Visuals provide a way to show various visual debug info in the game.
 */
export class Visual {
  readonly layer: number;
  readonly persistent: boolean;
  private commands: VisualCommand[] = [];

  constructor(layer = 0, persistent = false) {
    this.layer = layer;
    this.persistent = persistent;
  }

  /** Remove all visuals from the object */
  clear(): Visual {
    this.commands = [];
    return this;
  }

  /** Draw a circle */
  circle(position: Position, style?: CircleVisualStyle): Visual {
    this.commands.push({ type: 'circle', position, style });
    return this;
  }

  /** Draw a line */
  line(pos1: Position, pos2: Position, style?: LineVisualStyle): Visual {
    this.commands.push({ type: 'line', pos1, pos2, style });
    return this;
  }

  /** Draw a polyline */
  poly(points: Position[], style?: PolyVisualStyle): Visual {
    this.commands.push({ type: 'poly', points, style });
    return this;
  }

  /** Draw a rectangle */
  rect(pos: Position, w: number, h: number, style?: RectVisualStyle): Visual {
    this.commands.push({ type: 'rect', pos, w, h, style });
    return this;
  }

  /** Returns the size of the visuals in bytes */
  size(): number {
    return JSON.stringify(this.commands).length;
  }

  /** Draw a text label */
  text(text: string, pos: Position, style?: TextVisualStyle): Visual {
    this.commands.push({ type: 'text', text, pos, style });
    return this;
  }

  /** Get all visual commands for rendering */
  getCommands(): VisualCommand[] {
    return this.commands;
  }
}

/** Visual command types */
export type VisualCommand = 
  | { type: 'circle'; position: Position; style?: CircleVisualStyle }
  | { type: 'line'; pos1: Position; pos2: Position; style?: LineVisualStyle }
  | { type: 'poly'; points: Position[]; style?: PolyVisualStyle }
  | { type: 'rect'; pos: Position; w: number; h: number; style?: RectVisualStyle }
  | { type: 'text'; text: string; pos: Position; style?: TextVisualStyle };

