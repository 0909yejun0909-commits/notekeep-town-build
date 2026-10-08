// The book art's pages are a peach tan that tires the eyes; swap its paper colours for cream
// once, client-side, and leave the cover alone. Kenmi's art can't be edited and redistributed.

export const BOOK_SRC = '/assets/ui/book.png';

const PAPER: [number, number][] = [
  [0xf6ca9f, 0xfcf8ef], // page
  [0xe69c69, 0xe4d8c4], // ornaments, page lines
  [0xbf6f4a, 0xc2a988], // page-edge shading
];

let pending: Promise<string> | null = null;

export function paperBookUrl(): Promise<string> {
  pending ??= new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(BOOK_SRC);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      const swap = new Map(PAPER);
      for (let i = 0; i < px.length; i += 4) {
        const to = swap.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
        if (to === undefined) continue;
        px[i] = to >> 16;
        px[i + 1] = (to >> 8) & 0xff;
        px[i + 2] = to & 0xff;
      }
      ctx.putImageData(data, 0, 0);
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : BOOK_SRC));
    };
    img.onerror = () => resolve(BOOK_SRC);
    img.src = BOOK_SRC;
  });
  return pending;
}
