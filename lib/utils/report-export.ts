"use client";

type PdfTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center" | "right";
};

type PdfTableRow = Record<string, string | number>;

type PdfTableSection = {
  title: string;
  subtitle?: string;
  startOnNewPage?: boolean;
  columns: PdfTableColumn[];
  rows: PdfTableRow[];
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toPdfColor(hex: string) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function wrapText(text: string, maxChars: number) {
  if (text.length <= maxChars) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function approximateTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.52;
}

export async function downloadPngFromSvg(
  svgMarkup: string,
  filename: string,
  width: number,
  height: number,
) {
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available.");

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Could not generate image.");

    downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadSimplePdf(filename: string, title: string, lines: string[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 40;
  const startY = 790;
  const lineHeight = 16;
  const maxLinesPerPage = 44;

  const pages: string[][] = [];
  let current: string[] = [];

  for (const line of [title, "", ...lines]) {
    current.push(line);
    if (current.length >= maxLinesPerPage) {
      pages.push(current);
      current = [];
    }
  }
  if (current.length > 0) pages.push(current);

  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageKids: string[] = [];
  const firstPageObjectId = 4;
  const firstContentObjectId = 5;

  for (let index = 0; index < pages.length; index += 1) {
    const pageObjectId = firstPageObjectId + index * 2;
    pageKids.push(`${pageObjectId} 0 R`);
  }

  objects.push(
    `<< /Type /Pages /Kids [${pageKids.join(" ")}] /Count ${pages.length} >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const linesForPage = pages[pageIndex]!;
    const contentLines = ["BT", "/F1 12 Tf", `${marginX} ${startY} Td`];

    linesForPage.forEach((line, index) => {
      if (index === 0) contentLines.push(`(${escapePdfText(line)}) Tj`);
      else contentLines.push(`0 -${lineHeight} Td (${escapePdfText(line)}) Tj`);
    });

    contentLines.push("ET");
    const stream = contentLines.join("\n");

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${firstContentObjectId + pageIndex * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  downloadBlob(new Blob([pdf], { type: "application/pdf" }), filename);
}

export function downloadTablePdf(filename: string, documentTitle: string, sections: PdfTableSection[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 32;
  const usableWidth = pageWidth - margin * 2;
  const sectionGap = 18;
  const titleLines = wrapText(documentTitle, 42);

  const bg = toPdfColor("0b1020");
  const panel = toPdfColor("151b30");
  const border = toPdfColor("303a66");
  const accent = toPdfColor("7f88ff");
  const text = toPdfColor("f2f5ff");
  const subtle = toPdfColor("92a0c6");
  const headerFill = toPdfColor("1d2648");

  const pages: string[][] = [];
  let current: string[] = [];
  let y = pageHeight - margin;

  const beginPage = () => {
    current.push(`${bg} rg 0 0 ${pageWidth} ${pageHeight} re f`);
    let titleY = pageHeight - margin - 8;
    for (const line of titleLines) {
      current.push("BT");
      current.push(`/F2 22 Tf ${text} rg ${margin} ${titleY} Td (${escapePdfText(line)}) Tj ET`);
      titleY -= 26;
    }
    y = titleY - 12;
  };

  const finishPage = () => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
    }
    y = pageHeight - margin;
  };

  const ensurePage = (neededHeight: number) => {
    if (current.length === 0) {
      beginPage();
    }

    if (y - neededHeight < margin) {
      finishPage();
      ensurePage(neededHeight);
    }
  };

  const drawSectionHeader = (section: PdfTableSection) => {
    const subtitleLines = section.subtitle ? wrapText(section.subtitle, 70) : [];
    const neededHeight = 38 + subtitleLines.length * 16 + 12 + 32;
    ensurePage(neededHeight);

    current.push(`${panel} rg ${margin} ${y - 8} ${usableWidth} 36 re f`);
    current.push(`${border} RG 1 w ${margin} ${y - 8} ${usableWidth} 36 re S`);
    current.push(`BT /F2 16 Tf ${text} rg ${margin + 14} ${y + 6} Td (${escapePdfText(section.title)}) Tj ET`);
    y -= 24;

    subtitleLines.forEach((line) => {
      current.push(`BT /F1 11 Tf ${subtle} rg ${margin + 14} ${y} Td (${escapePdfText(line)}) Tj ET`);
      y -= 15;
    });

    y -= 8;
    current.push(`${headerFill} rg ${margin} ${y - 22} ${usableWidth} 26 re f`);
    current.push(`${border} RG 1 w ${margin} ${y - 22} ${usableWidth} 26 re S`);

    let x = margin + 10;
    for (const column of section.columns) {
      const maxChars = Math.max(4, Math.floor((column.width - 20) / 6.4));
      const shown = column.label.length > maxChars ? `${column.label.slice(0, maxChars - 3)}...` : column.label;
      const fontSize = 10;
      const align = column.align ?? "left";
      const textWidth = approximateTextWidth(shown, fontSize);
      let textX = x;
      if (align === "center") textX = x + (column.width - textWidth) / 2;
      else if (align === "right") textX = x + column.width - textWidth - 10;
      current.push(`BT /F2 ${fontSize} Tf ${accent} rg ${textX.toFixed(2)} ${y - 6} Td (${escapePdfText(shown)}) Tj ET`);
      x += column.width;
    }
    y -= 30;
  };

  const drawRow = (section: PdfTableSection, row: PdfTableRow, zebra: boolean) => {
    ensurePage(34);
    if (zebra) current.push(`${panel} rg ${margin} ${y - 22} ${usableWidth} 28 re f`);
    current.push(`${border} RG 0.5 w ${margin} ${y - 22} ${usableWidth} 28 re S`);

    let x = margin + 10;
    for (const column of section.columns) {
      const value = String(row[column.key] ?? "");
      const align = column.align ?? "left";
      const fontSize = 11;
      const maxChars = Math.max(6, Math.floor((column.width - 20) / 6.1));
      const shown = value.length > maxChars ? `${value.slice(0, maxChars - 3)}...` : value;
      let textX = x;
      const textWidth = approximateTextWidth(shown, fontSize);
      if (align === "right") textX = x + column.width - textWidth - 10;
      else if (align === "center") textX = x + (column.width - textWidth) / 2;
      current.push(`BT /F1 ${fontSize} Tf ${text} rg ${textX.toFixed(2)} ${y - 7} Td (${escapePdfText(shown)}) Tj ET`);
      x += column.width;
    }
    y -= 30;
  };

  sections.forEach((section) => {
    if (section.startOnNewPage && current.length > 0) {
      finishPage();
    }
    drawSectionHeader(section);
    section.rows.forEach((row, index) => drawRow(section, row, index % 2 === 0));
    y -= sectionGap;
  });

  finishPage();

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  pages.forEach((commands, index) => {
    const contentObjectId = 6 + index * 2;
    const stream = commands.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  downloadBlob(new Blob([pdf], { type: "application/pdf" }), filename);
}
