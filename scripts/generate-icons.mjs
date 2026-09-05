import sharp from "sharp";
import png2icons from "png2icons";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = path.resolve("electron/assets/icon.svg");
const OUT = path.resolve("electron/assets/icons");

const APP_SIZES = [16, 32, 48, 128, 256, 512, 1024];
const TRAY_SIZES = [16, 32];

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const svgBuffer = await fs.readFile(SRC);

  for (const size of APP_SIZES) {
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(OUT, `icon-${size}.png`));
  }

  for (const size of TRAY_SIZES) {
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(OUT, `tray-${size}.png`));
    await sharp(svgBuffer)
      .resize(size * 2, size * 2)
      .png()
      .toFile(path.join(OUT, `tray-${size}@2x.png`));
  }

  const icoSource = await sharp(svgBuffer).resize(256, 256).png().toBuffer();
  const ico = png2icons.createICO(icoSource, png2icons.BILINEAR, 0, false, true);
  if (ico) await fs.writeFile(path.join(OUT, "icon.ico"), ico);

  const icnsSource = await sharp(svgBuffer).resize(1024, 1024).png().toBuffer();
  const icns = png2icons.createICNS(icnsSource, png2icons.BILINEAR, 0);
  if (icns) await fs.writeFile(path.join(OUT, "icon.icns"), icns);

  console.log(`✅ Generated icons in ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
