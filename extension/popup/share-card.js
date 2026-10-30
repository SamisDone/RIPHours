// Draws the 1200×630 share card straight onto a canvas. Always dark, so it
// looks the same wherever it gets posted.

import { formatHeadline } from "../shared/core.js";

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 84;
const COLORS = { bg: "#0e0e10", text: "#ecebe8", muted: "#a1a1a8", faint: "#6e6e76" };
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Inter", system-ui, sans-serif';

function joinSites(sites) {
  if (!sites.length) return "the sites I track";
  if (sites.length === 1) return sites[0];
  return `${sites.slice(0, -1).join(", ")} and ${sites.at(-1)}`;
}

function fit(ctx, text, maxWidth, font, start, min) {
  let size = start;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

export async function drawShareCard(canvas, { seconds, sites, range, accent, date }) {
  await Promise.all([
    document.fonts.load(`400 120px ${SERIF}`),
    document.fonts.load(`italic 400 40px ${SERIF}`),
    document.fonts.load(`600 20px ${SANS}`),
    document.fonts.load(`400 32px ${SANS}`),
  ]);

  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const inner = WIDTH - PAD * 2;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A faint wash of the accent from the top left, so the card isn't flat black.
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, 900);
  wash.addColorStop(0, `${accent}1f`);
  wash.addColorStop(1, `${accent}00`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = "alphabetic";

  ctx.font = `600 20px ${SANS}`;
  ctx.letterSpacing = "3px";
  ctx.fillStyle = accent;
  ctx.textAlign = "left";
  ctx.fillText("RIPHOURS", PAD, PAD + 14);

  ctx.letterSpacing = "0px";
  ctx.font = `400 20px ${SANS}`;
  ctx.fillStyle = COLORS.faint;
  ctx.textAlign = "right";
  ctx.fillText(date, WIDTH - PAD, PAD + 14);

  ctx.textAlign = "left";
  const headline = formatHeadline(seconds);
  fit(ctx, headline, inner, (s) => `400 ${s}px ${SERIF}`, 156, 64);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(headline, PAD - 4, 318);

  const subline = `${range === "today" ? "today on" : "of my life on"} ${joinSites(sites)}.`;
  fit(ctx, subline, inner, (s) => `400 ${s}px ${SANS}`, 34, 20);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(subline, PAD, 386);

  ctx.fillStyle = accent;
  ctx.fillRect(PAD, 470, 56, 3);

  ctx.font = `italic 400 42px ${SERIF}`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText("Time is finite.", PAD, HEIGHT - PAD);

  ctx.font = `400 18px ${SANS}`;
  ctx.fillStyle = COLORS.faint;
  ctx.textAlign = "right";
  ctx.fillText("tracked locally with RIPHours", WIDTH - PAD, HEIGHT - PAD);
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))), "image/png");
  });
}
