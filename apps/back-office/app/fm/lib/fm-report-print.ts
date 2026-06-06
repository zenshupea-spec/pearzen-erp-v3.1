const A4_PRINT_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  @media print {
    body { padding: 0 !important; }
    .no-print { display: none !important; }
  }
`;

export function openFmA4Report(opts: {
  title: string;
  subtitle: string;
  period: string;
  tableHeadHtml: string;
  tableBodyHtml: string;
  /** When set, replaces the default single-table body (e.g. multi-page bulk payslips). */
  contentHtml?: string;
  extraCss?: string;
  footerNote?: string;
  autoPrint?: boolean;
}) {
  const {
    title,
    subtitle,
    period,
    tableHeadHtml,
    tableBodyHtml,
    contentHtml,
    extraCss = '',
    footerNote,
    autoPrint = true,
  } = opts;
  const generated = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title} — ${period}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#0f172a;padding:24px;font-size:11px;}
    .hdr{border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px;}
    .hdr h1{font-size:18px;font-weight:900;letter-spacing:.02em;}
    .hdr p{font-size:11px;color:#64748b;margin-top:4px;}
    .meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:14px;font-size:10px;color:#475569;}
    table{width:100%;border-collapse:collapse;}
    th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top;}
    th{background:#f1f5f9;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#475569;}
    td.num{text-align:right;font-variant-numeric:tabular-nums;}
    tfoot td{font-weight:800;background:#f8fafc;}
    .foot{margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;}
    ${extraCss}
    ${A4_PRINT_CSS}
  </style>
</head>
<body>
  <div class="hdr">
    <h1>${title}</h1>
    <p>${subtitle}</p>
  </div>
  <div class="meta">
    <span><strong>Period:</strong> ${period}</span>
    <span><strong>Generated:</strong> ${generated}</span>
  </div>
  ${
    contentHtml ??
    `<table>
    <thead>${tableHeadHtml}</thead>
    <tbody>${tableBodyHtml}</tbody>
  </table>`
  }
  <div class="foot">
    <p>Classic Venture ERP — Finance Manager Portfolio Report</p>
    ${footerNote ? `<p style="margin-top:6px;">${footerNote}</p>` : ''}
  </div>
  ${autoPrint ? '<script>window.onload=function(){window.print();}</script>' : ''}
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=1000');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export async function downloadFmA4Pdf(opts: {
  filename: string;
  title: string;
  subtitle: string;
  period: string;
  tableHeadHtml: string;
  tableBodyHtml: string;
  contentHtml?: string;
}) {
  const { filename, title, subtitle, period, tableHeadHtml, tableBodyHtml, contentHtml } = opts;
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:-9999px;top:0;width:794px;padding:24px;background:#fff;font-family:system-ui,sans-serif;font-size:11px;color:#0f172a;';
  container.innerHTML = `
    <div style="border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px;">
      <h1 style="font-size:18px;font-weight:900;margin:0;">${title}</h1>
      <p style="font-size:11px;color:#64748b;margin:8px 0 0;">${subtitle} · ${period}</p>
    </div>
    ${
      contentHtml ??
      `<table style="width:100%;border-collapse:collapse;">
      <thead>${tableHeadHtml}</thead>
      <tbody>${tableBodyHtml}</tbody>
    </table>`
    }
  `;
  document.body.appendChild(container);

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
