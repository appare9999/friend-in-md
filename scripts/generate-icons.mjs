import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = path.resolve("assets/icon.svg");
const OUT = path.resolve("src/client/public/icons");

const SIZES = [192, 512];

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const svgBuffer = await fs.readFile(SRC);

  for (const size of SIZES) {
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(OUT, `icon-${size}.png`));
  }

  console.log(`✅ Generated icons in ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
