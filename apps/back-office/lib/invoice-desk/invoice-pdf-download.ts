import { INVOICE_A4_WIDTH_PX } from './invoice-document';

const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;

/** Locks layout for raster capture (html2canvas ignores mm reliably). */
const PDF_CAPTURE_STYLE = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    width: ${INVOICE_A4_WIDTH_PX}px !important;
    overflow: visible !important;
  }
  .page {
    width: ${INVOICE_A4_WIDTH_PX}px !important;
    max-width: ${INVOICE_A4_WIDTH_PX}px !important;
    margin: 0 !important;
    overflow: visible !important;
  }
`;

function waitForImages(doc: Document, timeoutMs = 10_000): Promise<void> {
  const imgs = Array.from(doc.images);
  if (imgs.length === 0) return Promise.resolve();

  return Promise.race([
    Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    ).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Places a screenshot on fixed A4 pages (210×297 mm).
 * Each page is a horizontal slice of the image — no stretched page sizes.
 */
function placeImageOnA4Pages(
  pdf: import('jspdf').jsPDF,
  source: HTMLCanvasElement,
  imgType: 'JPEG' | 'PNG' = 'JPEG',
  quality = 0.98,
): void {
  const pageWidthMm = PDF_PAGE_WIDTH_MM;
  const pageHeightMm = PDF_PAGE_HEIGHT_MM;

  const fullWidthMm = pageWidthMm;
  const fullHeightMm = (source.height * fullWidthMm) / source.width;

  if (fullHeightMm <= pageHeightMm + 0.5) {
    const imgData = source.toDataURL('image/jpeg', quality);
    pdf.addImage(imgData, imgType, 0, 0, fullWidthMm, fullHeightMm);
    return;
  }

  const sliceHeightPx = Math.floor((source.width * pageHeightMm) / pageWidthMm);
  const sliceCanvas = document.createElement('canvas');
  const sliceCtx = sliceCanvas.getContext('2d');
  if (!sliceCtx) {
    throw new Error('Could not create PDF slice canvas.');
  }

  sliceCanvas.width = source.width;

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < source.height) {
    const slicePx = Math.min(sliceHeightPx, source.height - offsetY);
    sliceCanvas.height = slicePx;

    sliceCtx.fillStyle = '#ffffff';
    sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceCtx.drawImage(
      source,
      0,
      offsetY,
      source.width,
      slicePx,
      0,
      0,
      source.width,
      slicePx,
    );

    const sliceData = sliceCanvas.toDataURL('image/jpeg', quality);
    const sliceHeightMm = (slicePx * pageWidthMm) / source.width;

    if (pageIndex > 0) {
      pdf.addPage('a4', 'portrait');
    }

    pdf.addImage(sliceData, imgType, 0, 0, pageWidthMm, sliceHeightMm);
    offsetY += slicePx;
    pageIndex += 1;
  }
}

/** Renders invoice HTML off-screen, snapshots it, and saves as a true A4 PDF. */
export async function downloadTaxInvoicePdf(html: string, filename: string): Promise<void> {
  const pdfName = filename.toLowerCase().endsWith('.pdf')
    ? filename
    : filename.replace(/\.html$/i, '.pdf');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${INVOICE_A4_WIDTH_PX}px;height:10000px;border:0;visibility:hidden`;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error('Could not render invoice for PDF export.');
  }

  try {
    doc.open();
    doc.write(html);
    doc.close();

    const style = doc.createElement('style');
    style.textContent = PDF_CAPTURE_STYLE;
    doc.head.appendChild(style);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    try {
      await doc.fonts?.ready;
    } catch {
      /* optional */
    }
    await waitForImages(doc);

    const page = doc.querySelector('.page') as HTMLElement | null;
    if (!page) {
      throw new Error('Invoice layout not found.');
    }

    const captureWidth = page.scrollWidth || INVOICE_A4_WIDTH_PX;
    const captureHeight = page.scrollHeight;

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc) => {
        const styleEl = clonedDoc.createElement('style');
        styleEl.textContent = PDF_CAPTURE_STYLE;
        clonedDoc.head.appendChild(styleEl);
        const clonedPage = clonedDoc.querySelector('.page') as HTMLElement | null;
        if (clonedPage) {
          clonedPage.style.width = `${INVOICE_A4_WIDTH_PX}px`;
          clonedPage.style.maxWidth = `${INVOICE_A4_WIDTH_PX}px`;
          clonedPage.style.margin = '0';
        }
        const clonedBody = clonedDoc.body;
        if (clonedBody) {
          clonedBody.style.padding = '0';
          clonedBody.style.margin = '0';
          clonedBody.style.background = '#fff';
        }
      },
    });

    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: true,
    });

    placeImageOnA4Pages(pdf, canvas);
    pdf.save(pdfName);
  } finally {
    document.body.removeChild(iframe);
  }
}
